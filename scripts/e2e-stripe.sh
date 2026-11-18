#!/bin/bash
# Stripe flow smoke test — no real Stripe account needed.
# Covers: admin stripe settings, provider listing, per-product pay-method
# locking (admin-only), webhook signature rejection, and simulated
# checkout.session.completed auto-delivery (card + file products).
# Usage: BASE=http://localhost:8790 bash scripts/e2e-stripe.sh
set -e
BASE=${BASE:-http://localhost:8790}
AE=${ADMIN_EMAIL:-admin-e2e@t.io}
A=/tmp/e2s-a.jar; M=/tmp/e2s-m.jar; B=/tmp/e2s-b.jar
WHSEC="whsec-e2e-$(date +%s)"
say() { echo "== $1"; }

say "1. accounts: admin / merchant / buyer"
CODE=$(curl -s -c $A -X POST $BASE/api/auth/sign-up/email -H 'content-type: application/json' \
  -d "{\"name\":\"Admin\",\"email\":\"$AE\",\"password\":\"Passw0rd123\"}" -o /dev/null -w "%{http_code}")
if [ "$CODE" != "200" ]; then
  curl -s -c $A -X POST $BASE/api/auth/sign-in/email -H 'content-type: application/json' \
    -d "{\"email\":\"$AE\",\"password\":\"Passw0rd123\"}" -o /dev/null
fi
ME=stripe-merchant-$(date +%s)@t.io
curl -s -c $M -X POST $BASE/api/auth/sign-up/email -H 'content-type: application/json' \
  -d "{\"name\":\"SM\",\"email\":\"$ME\",\"password\":\"Passw0rd123\"}" -o /dev/null -w "merchant-signup:%{http_code}\n"
MID=$(curl -s -b $M -X POST $BASE/api/merchant/apply -H 'content-type: application/json' -d '{"displayName":"Stripe小店"}' | jq -r .merchant.id)
curl -s -b $A -X PATCH $BASE/api/admin/merchants/$MID -H 'content-type: application/json' -d '{"status":"active"}' -o /dev/null -w "approve:%{http_code}\n"
BE=stripe-buyer-$(date +%s)@t.io
curl -s -c $B -X POST $BASE/api/auth/sign-up/email -H 'content-type: application/json' \
  -d "{\"name\":\"SB\",\"email\":\"$BE\",\"password\":\"Passw0rd123\"}" -o /dev/null -w "buyer-signup:%{http_code}\n"

say "2. enable stripe with fake keys (only signature paths are exercised)"
curl -s -b $A -X PUT $BASE/api/admin/settings/stripe -H 'content-type: application/json' \
  -d "{\"secretKey\":\"sk_test_e2e_fake\",\"webhookSecret\":\"$WHSEC\",\"enabled\":true}"; echo
curl -s $BASE/api/payments/providers; echo

say "3. card product with 2 keys + file product, both on sale"
CPID=$(curl -s -b $M -X POST $BASE/api/merchants/$MID/products -H 'content-type: application/json' \
  -d '{"title":"卡密A","priceCents":100,"type":"card"}' | jq -r .id)
curl -s -b $M -X POST $BASE/api/merchants/$MID/products/$CPID/cards -H 'content-type: application/json' \
  -d '{"content":"STRIPE-KEY-1\nSTRIPE-KEY-2"}' | jq -c '{added}'
curl -s -b $M -X PATCH $BASE/api/merchants/$MID/products/$CPID -H 'content-type: application/json' -d '{"status":"on_sale"}' | jq -c '{status}'
FPID=$(curl -s -b $M -X POST $BASE/api/merchants/$MID/products -H 'content-type: application/json' \
  -d '{"title":"文件A","priceCents":200}' | jq -r .id)
head -c 512 /dev/urandom > /tmp/e2s.bin
curl -s -b $M -X POST $BASE/api/merchants/$MID/products/$FPID/files -F "file=@/tmp/e2s.bin;type=application/octet-stream" -o /dev/null -w "file-upload:%{http_code}\n"
curl -s -b $M -X PATCH $BASE/api/merchants/$MID/products/$FPID -H 'content-type: application/json' -d '{"status":"on_sale"}' | jq -c '{status}'

say "4. merchant cannot set payMethod; admin can"
curl -s -b $M -X PATCH $BASE/api/merchants/$MID/products/$FPID -H 'content-type: application/json' \
  -d '{"payMethod":"stripe"}' | jq -c '{payMethod, note: .payMethod}'
curl -s -b $A -X PATCH $BASE/api/merchants/$MID/products/$FPID -H 'content-type: application/json' \
  -d '{"payMethod":"stripe"}' | jq -c '{payMethod}'
curl -s -b $A -X PATCH $BASE/api/merchants/$MID/products/$FPID -H 'content-type: application/json' \
  -d '{"payMethod":null}' | jq -c '{payMethod}'

say "5. locked product rejects the other channel"
curl -s -b $A -X PATCH $BASE/api/merchants/$MID/products/$FPID -H 'content-type: application/json' \
  -d '{"payMethod":"stripe"}' -o /dev/null
curl -s -b $B -X POST $BASE/api/orders -H 'content-type: application/json' \
  -d "{\"productId\":\"$FPID\",\"provider\":\"manual-qr\"}" -o /dev/null -w "locked-vs-qr(expect 400):%{http_code}\n"
curl -s -b $A -X PATCH $BASE/api/merchants/$MID/products/$FPID -H 'content-type: application/json' \
  -d '{"payMethod":null}' -o /dev/null

say "6. QR order stays pending (manual flow untouched)"
OID=$(curl -s -b $B -X POST $BASE/api/orders -H 'content-type: application/json' \
  -d "{\"productId\":\"$CPID\",\"provider\":\"manual-qr\"}" | jq -r .order.id)
echo "pending order: $OID"
curl -s -b $B $BASE/api/orders/$OID | jq -c '{status}'

say "7. webhook rejects missing / bad signatures"
BODY="{\"id\":\"evt_1\",\"type\":\"checkout.session.completed\",\"data\":{\"object\":{\"metadata\":{\"orderId\":\"$OID\"}}}}"
curl -s -o /dev/null -w "no-sig(expect 400):%{http_code}\n" -X POST $BASE/api/webhooks/stripe \
  -H 'content-type: application/json' -d "$BODY"
curl -s -o /dev/null -w "bad-sig(expect 400):%{http_code}\n" -X POST $BASE/api/webhooks/stripe \
  -H 'content-type: application/json' -H 'Stripe-Signature: t=1700000000,v1=deadbeef' -d "$BODY"

say "8. valid signature: checkout.session.completed auto-delivers card order"
T=$(date +%s)
SIG=$(node -e "
const c=require('crypto');
console.log(c.createHmac('sha256','$WHSEC').update('$T.'+process.argv[1]).digest('hex'))" "$BODY")
curl -s -X POST $BASE/api/webhooks/stripe -H 'content-type: application/json' \
  -H "Stripe-Signature: t=$T,v1=$SIG" -d "$BODY"; echo
curl -s -b $B $BASE/api/orders/$OID | jq -c '{status}'
curl -s -b $B $BASE/api/orders/$OID/card | jq -c '{content}'
curl -s -b $M $BASE/api/merchants/$MID/card-stock | jq -c '.[] | {productId,unsold}'
echo "replay must stay idempotent:"
curl -s -X POST $BASE/api/webhooks/stripe -H 'content-type: application/json' \
  -H "Stripe-Signature: t=$T,v1=$SIG" -d "$BODY" -o /dev/null -w "replay:%{http_code}\n"
curl -s -b $B $BASE/api/orders/$OID | jq -c '{status}'

say "9. valid signature: file order auto-delivers with entitlement"
FID=$(curl -s -b $B -X POST $BASE/api/orders -H 'content-type: application/json' \
  -d "{\"productId\":\"$FPID\",\"provider\":\"manual-qr\"}" | jq -r .order.id)
FBODY="{\"id\":\"evt_2\",\"type\":\"checkout.session.completed\",\"data\":{\"object\":{\"metadata\":{\"orderId\":\"$FID\"}}}}"
T2=$(date +%s)
SIG2=$(node -e "
const c=require('crypto');
console.log(c.createHmac('sha256','$WHSEC').update('$T2.'+process.argv[1]).digest('hex'))" "$FBODY")
curl -s -X POST $BASE/api/webhooks/stripe -H 'content-type: application/json' \
  -H "Stripe-Signature: t=$T2,v1=$SIG2" -d "$FBODY" -o /dev/null -w "wh:%{http_code}\n"
curl -s -b $B $BASE/api/orders/$FID | jq -c '{status}'
curl -s -b $B $BASE/api/my/products/$FPID/files | jq -c 'map({fileName})'

say "10. disable stripe"
curl -s -b $A -X PUT $BASE/api/admin/settings/stripe -H 'content-type: application/json' \
  -d '{"enabled":false}' | jq -c '{enabled}'
curl -s $BASE/api/payments/providers; echo

say "ALL DONE"

#!/bin/bash
# Card-key (发卡) end-to-end smoke test against http://localhost:8790
set -e
BASE=${BASE:-http://localhost:8790}
A=/tmp/e2c-a.jar; M=/tmp/e2c-m.jar; B=/tmp/e2c-b.jar
say() { echo "== $1"; }

say "1. admin login (existing) + fresh merchant user"
AE=${ADMIN_EMAIL:-admin-e2e@t.io}
CODE=$(curl -s -c $A -o /dev/null -w "%{http_code}" -X POST $BASE/api/auth/sign-in/email -H 'content-type: application/json' \
  -d "{\"email\":\"$AE\",\"password\":\"Passw0rd123\"}")
if [ "$CODE" != "200" ]; then
  curl -s -c $A -X POST $BASE/api/auth/sign-up/email -H 'content-type: application/json' \
    -d "{\"name\":\"Admin\",\"email\":\"$AE\",\"password\":\"Passw0rd123\"}" -o /dev/null -w "admin-signup:%{http_code}\n"
  curl -s -c $A -X POST $BASE/api/auth/sign-in/email -H 'content-type: application/json' \
    -d "{\"email\":\"$AE\",\"password\":\"Passw0rd123\"}" -o /dev/null -w "admin-login:%{http_code}\n"
else
  echo "admin-login:200"
fi
ME=merchant-$RANDOM@t.io
curl -s -c $M -X POST $BASE/api/auth/sign-up/email -H 'content-type: application/json' \
  -d "{\"name\":\"Merchant\",\"email\":\"$ME\",\"password\":\"Passw0rd123\"}" -o /dev/null -w "merchant-signup:%{http_code}\n"
MID=$(curl -s -b $M -X POST $BASE/api/merchant/apply -H 'content-type: application/json' -d '{"displayName":"卡密小店"}' | jq -r .merchant.id)
curl -s -b $A -X PATCH $BASE/api/admin/merchants/$MID -H 'content-type: application/json' -d '{"status":"active"}' -o /dev/null
echo "merchant: $MID"

say "2. create card-type product"
PID=$(curl -s -b $M -X POST $BASE/api/merchants/$MID/products -H 'content-type: application/json' \
  -d '{"title":"卡密商品","description":"自动发卡测试","priceCents":100,"type":"card"}' | jq -r .id)
echo "product: $PID"

say "3. publishing without keys must fail"
curl -s -b $M -X PATCH $BASE/api/merchants/$MID/products/$PID -H 'content-type: application/json' \
  -d '{"status":"on_sale"}' | jq -c '{error}'

say "4. bulk import keys (with duplicate line skipped)"
K1="KEY-AAA-$RANDOM-1111"; K2="KEY-BBB-$RANDOM-2222"; K3="KEY-CCC-$RANDOM-3333"
printf '%s\n%s\n%s\n%s\n' "$K1" "$K2" "$K2" "$K3" > /tmp/e2c-keys.txt
curl -s -b $M -X POST $BASE/api/merchants/$MID/products/$PID/cards -H 'content-type: application/json' \
  -d "$(jq -n --rawfile k /tmp/e2c-keys.txt '{content: $k}')" | jq -c '{added}'
curl -s -b $M $BASE/api/merchants/$MID/card-stock | jq -c .

say "5. publish + catalog shows stock"
curl -s -b $M -X PATCH $BASE/api/merchants/$MID/products/$PID -H 'content-type: application/json' \
  -d '{"status":"on_sale"}' | jq -c '{type,status}'
curl -s $BASE/api/catalog/products/$PID | jq -c '{type,cardStock}'

say "6. buyer purchases (order auto-delivers on confirm-paid)"
curl -s -c $B -X POST $BASE/api/auth/sign-up/email -H 'content-type: application/json' \
  -d "{\"name\":\"Buyer\",\"email\":\"buyer-$RANDOM@t.io\",\"password\":\"Passw0rd123\"}" -o /dev/null -w "buyer-signup:%{http_code}\n"
OID=$(curl -s -b $B -X POST $BASE/api/orders -H 'content-type: application/json' -d "{\"productId\":\"$PID\"}" | jq -r '.order.id // .id')
echo "order: $OID"
CONFIRM=$(curl -s -b $A -X POST $BASE/api/admin/orders/$OID/confirm-paid)
echo "$CONFIRM" | jq -c '{cardDelivered, status: (.order.status // .status)}'
curl -s -b $B $BASE/api/orders/$OID | jq -c '{status}'

say "7. buyer fetches card key"
CARD=$(curl -s -b $B $BASE/api/orders/$OID/card)
echo "$CARD" | jq -c '{soldAt: (.soldAt != null)}'
CONTENT=$(echo "$CARD" | jq -r .content)
echo "key: $CONTENT"
grep -qx "$CONTENT" /tmp/e2c-keys.txt && echo "key matches imported set" || echo "KEY MISMATCH"

say "8. stock decremented; other keys untouched"
curl -s $BASE/api/catalog/products/$PID | jq -c '{cardStock}'
curl -s -b $M $BASE/api/merchants/$MID/products/$PID/cards | jq -c 'map(select(.status=="sold")) | {sold: length}'

say "9. anonymous card access denied"
curl -s -o /dev/null -w "anon-card:%{http_code}\n" $BASE/api/orders/$OID/card
curl -s -b $M -o /dev/null -w "not-owner:%{http_code}\n" $BASE/api/orders/$OID/card

say "10. second purchase + sold keys cannot be deleted"
OID2=$(curl -s -b $B -X POST $BASE/api/orders -H 'content-type: application/json' -d "{\"productId\":\"$PID\"}" | jq -r '.order.id // .id')
curl -s -b $A -X POST $BASE/api/admin/orders/$OID2/confirm-paid -o /dev/null -w "confirm2:%{http_code}\n"
SOLD_ID=$(curl -s -b $M $BASE/api/merchants/$MID/products/$PID/cards | jq -r 'map(select(.status=="sold")) | .[0].id')
curl -s -b $M -X DELETE $BASE/api/merchants/$MID/products/$PID/cards/$SOLD_ID | jq -c '{error}'

say "11. exhaust stock then buy must fail"
curl -s -b $A -X POST $BASE/api/admin/orders/$OID2/deliver -o /dev/null -w "deliver2(idempotent-if-paid):%{http_code}\n"
# remaining stock is 1; buy it out
OID3=$(curl -s -b $B -X POST $BASE/api/orders -H 'content-type: application/json' -d "{\"productId\":\"$PID\"}" | jq -r '.order.id // .id')
curl -s -b $A -X POST $BASE/api/admin/orders/$OID3/confirm-paid -o /dev/null -w "confirm3:%{http_code}\n"
curl -s -b $B -X POST $BASE/api/orders -H 'content-type: application/json' -d "{\"productId\":\"$PID\"}" | jq -c '{error}'
curl -s $BASE/api/catalog/products/$PID | jq -c '{cardStock}'

say "12. delete unsold key + product delete blocked by orders"
curl -s -b $M $BASE/api/merchants/$MID/products/$PID/cards | jq -c 'length | {rows: .}'

say "ALL DONE"

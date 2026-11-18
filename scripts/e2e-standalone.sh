#!/bin/bash
# Standalone (PG + RustFS) end-to-end smoke test against http://localhost:8790
set -e
BASE=http://localhost:8790
A=/tmp/e2e-a.jar; M=/tmp/e2e-m.jar
say() { echo "== $1"; }

say "1. admin signup (first user becomes admin)"
CODE=$(curl -s -c $A -X POST $BASE/api/auth/sign-up/email -H 'content-type: application/json' \
  -d '{"name":"Admin","email":"admin-e2e@t.io","password":"Passw0rd123"}' -o /dev/null -w "%{http_code}")
echo "signup:$CODE"
if [ "$CODE" != "200" ]; then
  curl -s -c $A -X POST $BASE/api/auth/sign-in/email -H 'content-type: application/json' \
    -d '{"email":"admin-e2e@t.io","password":"Passw0rd123"}' -o /dev/null -w "signin:%{http_code}\n"
fi
curl -s -b $A $BASE/api/admin/settings; echo

say "2. merchant user signup + apply"
ME=merchant-$(date +%s)@t.io
curl -s -c $M -X POST $BASE/api/auth/sign-up/email -H 'content-type: application/json' \
  -d "{\"name\":\"Merchant\",\"email\":\"$ME\",\"password\":\"Passw0rd123\"}" -o /dev/null -w "signup:%{http_code}\n"
MID=$(curl -s -b $M -X POST $BASE/api/merchant/apply -H 'content-type: application/json' -d '{"displayName":"单机小店"}' | jq -r .merchant.id)
echo "merchant: $MID"

say "3. admin approves merchant"
curl -s -b $A -X PATCH $BASE/api/admin/merchants/$MID -H 'content-type: application/json' -d '{"status":"active"}' | jq -c '{status,displayName}'

say "4. create product"
PID=$(curl -s -b $M -X POST $BASE/api/merchants/$MID/products -H 'content-type: application/json' \
  -d '{"title":"PG 商品","description":"单机部署测试","priceCents":990}' | jq -r .id)
echo "product: $PID"

say "5. single-request file upload (S3 put)"
head -c 1024 /dev/urandom > /tmp/e2e-small.bin
curl -s -b $M -X POST $BASE/api/merchants/$MID/products/$PID/files \
  -F "file=@/tmp/e2e-small.bin;type=application/octet-stream" | jq -c '{id,fileName,sizeBytes,contentType}'
SMALL_FILE_ID=$(curl -s -b $M $BASE/api/merchants/$MID/products/$PID/files | jq -r '.[0].id')

say "6. multipart upload: 12MB in 2 x 6MB parts (S3 MPU)"
BIG=/tmp/e2e-big.bin
head -c 12582912 /dev/urandom > $BIG
head -c 6291456 $BIG > /tmp/e2e-p1.bin
tail -c +6291457 $BIG > /tmp/e2e-p2.bin
INIT=$(curl -s -b $M -X POST $BASE/api/merchants/$MID/products/$PID/files/init -H 'content-type: application/json' \
  -d '{"fileName":"big.bin","contentType":"application/octet-stream","sizeBytes":12582912}')
KEY=$(echo "$INIT" | jq -r .key)
UPID=$(echo "$INIT" | jq -r .uploadId)
echo "key: $KEY uploadId: ${UPID:0:20}..."
KEYE=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1],safe=''))" "$KEY")
UPIDE=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1],safe=''))" "$UPID")
P1=$(curl -s -b $M -X PUT "$BASE/api/merchants/$MID/products/$PID/files/part?key=$KEYE&uploadId=$UPIDE&partNumber=1" \
  -H 'content-type: application/octet-stream' --data-binary @/tmp/e2e-p1.bin)
P2=$(curl -s -b $M -X PUT "$BASE/api/merchants/$MID/products/$PID/files/part?key=$KEYE&uploadId=$UPIDE&partNumber=2" \
  -H 'content-type: application/octet-stream' --data-binary @/tmp/e2e-p2.bin)
E1=$(echo "$P1" | jq -r .etag | tr -d '"'); E2=$(echo "$P2" | jq -r .etag | tr -d '"')
echo "part1 etag: ${E1:0:12}... part2 etag: ${E2:0:12}..."
CMP=$(curl -s -b $M -X POST $BASE/api/merchants/$MID/products/$PID/files/complete -H 'content-type: application/json' \
  -d "{\"fileName\":\"big.bin\",\"contentType\":\"application/octet-stream\",\"key\":\"$KEY\",\"uploadId\":\"$UPID\",\"parts\":[{\"partNumber\":1,\"etag\":\"$E1\"},{\"partNumber\":2,\"etag\":\"$E2\"}]}")
echo "$CMP" | jq -c '{id,fileName,sizeBytes}'
BIG_FILE_ID=$(echo "$CMP" | jq -r .id)

say "7. on-sale + buyer order flow (QR payment)"
curl -s -b $M -X PATCH $BASE/api/merchants/$MID/products/$PID -H 'content-type: application/json' -d '{"status":"on_sale"}' | jq -c '{status}'
head -c 200 /dev/urandom > /tmp/e2e-qr.png
QID=$(curl -s -b $A -X POST $BASE/api/admin/qr-codes -F "file=@/tmp/e2e-qr.png;type=image/png" -F "label=测试码" | jq -r .id)
echo "qrCode: $QID"
curl -s -b $A -o /tmp/e2e-qr-dl.png -w "qr image:%{http_code}\n" $BASE/api/admin/qr-codes/$QID/image
cmp -s /tmp/e2e-qr.png /tmp/e2e-qr-dl.png && echo "qr bytes identical" || echo "QR BYTES MISMATCH"
OID=$(curl -s -b $A -X POST $BASE/api/orders -H 'content-type: application/json' -d "{\"productId\":\"$PID\",\"provider\":\"manual-qr\"}" | jq -r '.order.id // .id')
echo "order: $OID"
curl -s -b $A -X POST $BASE/api/admin/orders/$OID/confirm-paid -o /dev/null -w "confirm-paid:%{http_code}\n"
curl -s -b $A -X POST $BASE/api/admin/orders/$OID/deliver -o /dev/null -w "deliver:%{http_code}\n"

say "8. buyer downloads both files (S3 get)"
curl -s -b $A -o /tmp/e2e-small-dl.bin -w "small:%{http_code} " $BASE/api/files/download/$SMALL_FILE_ID
curl -s -b $A -o /tmp/e2e-big-dl.bin -w "big:%{http_code}\n" $BASE/api/files/download/$BIG_FILE_ID
cmp -s /tmp/e2e-small.bin /tmp/e2e-small-dl.bin && echo "small bytes identical" || echo "SMALL BYTES MISMATCH"
cmp -s $BIG /tmp/e2e-big-dl.bin && echo "big(12MB) bytes identical" || echo "BIG BYTES MISMATCH"

say "9. unauthenticated download must fail"
curl -s -o /dev/null -w "anon:%{http_code}\n" $BASE/api/files/download/$BIG_FILE_ID

say "10. delete product (runBatch transaction + S3 delete)"
curl -s -b $M -X PATCH $BASE/api/merchants/$MID/products/$PID -H 'content-type: application/json' -d '{"status":"draft"}' -o /dev/null -w "to-draft:%{http_code}\n"
curl -s -b $M -X DELETE $BASE/api/merchants/$MID/products/$PID -o /dev/null -w "delete:%{http_code}\n"
curl -s -b $A $BASE/api/admin/orders | jq -c 'length | {orders: .}'

say "11. account delete (runBatch) for merchant user"
curl -s -b $M -X POST $BASE/api/account/delete -o /dev/null -w "account-delete:%{http_code}\n"

say "ALL DONE"

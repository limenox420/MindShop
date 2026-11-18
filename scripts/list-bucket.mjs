import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";

const client = new S3Client({
  endpoint: "http://127.0.0.1:9000",
  region: "us-east-1",
  credentials: { accessKeyId: "mindshop", secretAccessKey: "mindshop123" },
  forcePathStyle: true,
});
const res = await client.send(
  new ListObjectsV2Command({ Bucket: "mindshop" }),
);
for (const o of res.Contents ?? []) console.log(o.Key, o.Size);
console.log("total objects:", res.KeyCount ?? 0);

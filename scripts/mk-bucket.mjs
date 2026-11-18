import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";

const client = new S3Client({
  endpoint: "http://127.0.0.1:9000",
  region: "us-east-1",
  credentials: { accessKeyId: "mindshop", secretAccessKey: "mindshop123" },
  forcePathStyle: true,
});
try {
  await client.send(new CreateBucketCommand({ Bucket: "mindshop" }));
  console.log("bucket created");
} catch (err) {
  console.log("bucket:", err.name, err.message);
}

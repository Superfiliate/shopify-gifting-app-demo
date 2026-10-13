import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import { z } from "zod";

const credentialsSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
});
export type Credentials = z.infer<typeof credentialsSchema>;

function encryptionKey() {
  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret)
    throw new Error(
      "Shopify app credentials must be configured before saving settings.",
    );
  return Buffer.from(
    hkdfSync(
      "sha256",
      secret,
      "superfiliate-gifting",
      "stored-api-credentials-v1",
      32,
    ),
  );
}

export function encryptCredentials(shop: string, credentials: Credentials) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(shop));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(credentialsSchema.parse(credentials)), "utf8"),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), ciphertext]
    .map((part) => part.toString("base64"))
    .join(".");
}

export function decryptCredentials(
  shop: string,
  encrypted: string,
): Credentials {
  const parts = encrypted.split(".");
  if (parts.length !== 3) throw new Error("Invalid stored credentials");
  const [iv, tag, ciphertext] = parts.map((part) =>
    Buffer.from(part, "base64"),
  );
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAAD(Buffer.from(shop));
  decipher.setAuthTag(tag);
  return credentialsSchema.parse(
    JSON.parse(
      Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
        "utf8",
      ),
    ),
  );
}

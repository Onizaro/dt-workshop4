import { webcrypto } from "crypto";
import { generateKeyPair } from "crypto";

// #############
// ### Utils ###
// #############

// Function to convert ArrayBuffer to Base64 string
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  return Buffer.from(buffer).toString("base64");
}

// Function to convert Base64 string to ArrayBuffer
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  var buff = Buffer.from(base64, "base64");
  return buff.buffer.slice(buff.byteOffset, buff.byteOffset + buff.byteLength);
}

// ################
// ### RSA keys ###
// ################

// Generates a pair of private / public RSA keys
type GenerateRsaKeyPair = {
  publicKey: webcrypto.CryptoKey;
  privateKey: webcrypto.CryptoKey;
};
export async function generateRsaKeyPair(): Promise<GenerateRsaKeyPair> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"]
  );

  return {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
  };
}


// Export a crypto public key to a base64 string format
export async function exportPubKey(key: webcrypto.CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey("spki", key);

  return Buffer.from(exported).toString("base64");
}

// Export a crypto private key to a base64 string format
export async function exportPrvKey(
  key: webcrypto.CryptoKey | null
): Promise<string | null> {
  if (!key) return null; 
  const exported = await crypto.subtle.exportKey("pkcs8", key);
  return Buffer.from(exported).toString("base64");
}


// Import a base64 string public key to its native format
export async function importPubKey(
  strKey: string
): Promise<webcrypto.CryptoKey> {
  const binaryDer = Buffer.from(strKey, "base64");
  return await crypto.subtle.importKey(
    "spki", 
    binaryDer,
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    true, 
    ["encrypt"] 
  );
}


// Import a base64 string private key to its native format
export async function importPrvKey(
  strKey: string
): Promise<webcrypto.CryptoKey> {
  const binaryDer = Buffer.from(strKey, "base64");
  return await crypto.subtle.importKey(
    "pkcs8", 
    binaryDer,
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    true, 
    ["decrypt"] 
  );
}


// Encrypt a message using an RSA public key
export async function rsaEncrypt(
  b64Data: string,
  strPublicKey: string
): Promise<string> {
  const publicKey = await importPubKey(strPublicKey);
  const dataBuffer = Buffer.from(b64Data, "base64");
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    publicKey,
    dataBuffer
  );
  return Buffer.from(encryptedBuffer).toString("base64");
}


// Decrypts a message using an RSA private key
export async function rsaDecrypt(
  data: string,
  privateKey: webcrypto.CryptoKey
): Promise<string> {
  const encryptedBuffer = Buffer.from(data, "base64");
  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: "RSA-OAEP" },
    privateKey,
    encryptedBuffer
  );
  return Buffer.from(decryptedBuffer).toString("base64");
}


// ######################
// ### Symmetric keys ###
// ######################

// Generates a random symmetric key
export async function createRandomSymmetricKey(): Promise<webcrypto.CryptoKey> {
  return await crypto.subtle.generateKey(
    {
      name: "AES-CBC",
      length: 256,
    },
    true,
    ["encrypt", "decrypt"]
  );
}

// Export a crypto symmetric key to a base64 string format
export async function exportSymKey(key: webcrypto.CryptoKey): Promise<string> {
  const rawKey = await crypto.subtle.exportKey("raw", key);
  return Buffer.from(rawKey).toString("base64");
}

// Import a base64 string format to its crypto native format
export async function importSymKey(
  strKey: string
): Promise<webcrypto.CryptoKey> {
  const rawKey = Buffer.from(strKey, "base64");
  return await crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: "AES-CBC" },
    true,
    ["encrypt", "decrypt"]
  );
}

// Encrypt a message using a symmetric key
export async function symEncrypt(
  key: webcrypto.CryptoKey,
  data: string
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const encodedData = new TextEncoder().encode(data);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-CBC", iv },
    key,
    encodedData
  );
  return Buffer.from(iv).toString("base64") + "." + Buffer.from(encrypted).toString("base64");
}

// Decrypt a message using a symmetric key
export async function symDecrypt(
  strKey: string,
  encryptedData: string
): Promise<string> {
  const [ivB64, encryptedB64] = encryptedData.split(".");
  const iv = Buffer.from(ivB64, "base64");
  const encryptedBuffer = Buffer.from(encryptedB64, "base64");
  const key = await importSymKey(strKey);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-CBC", iv },
    key,
    encryptedBuffer
  );
  return new TextDecoder().decode(decrypted);
}

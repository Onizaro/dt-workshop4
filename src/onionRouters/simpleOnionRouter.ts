import bodyParser from "body-parser";
import express from "express";
import { BASE_ONION_ROUTER_PORT, REGISTRY_PORT  } from "../config";
import { generateRsaKeyPair, exportPubKey, exportPrvKey } from "../crypto";

export async function simpleOnionRouter(nodeId: number) {
  const onionRouter = express();
  onionRouter.use(express.json());
  onionRouter.use(bodyParser.json());

  // TODO implement the status route
  onionRouter.get("/status", (req, res) => {
    res.send('live');
  });

  const { publicKey, privateKey } = await generateRsaKeyPair();
  const publicKeyString = await exportPubKey(publicKey);
  const privateKeyString = await exportPrvKey(privateKey);


  let lastReceivedEncryptedMessage: string | null = null;
  let lastDecryptedMessage: string | null = null;
  let lastDestination: string | number | null = null; 
  

  onionRouter.get("/getLastReceivedEncryptedMessage", (req, res) => {
    res.json({ result: lastReceivedEncryptedMessage });
  });

  onionRouter.get("/getLastReceivedDecryptedMessage", (req, res) => {
    res.json({ result: lastDecryptedMessage });
  });

  onionRouter.get("/getLastMessageDestination", (req, res) => {
    res.json({ result: lastDestination });
  });

  onionRouter.get("/getPrivateKey", (req, res) => {
    res.json({ result: privateKeyString });
  });

  const server = onionRouter.listen(BASE_ONION_ROUTER_PORT + nodeId, () => {
    console.log(
      `Onion router ${nodeId} is listening on port ${
        BASE_ONION_ROUTER_PORT + nodeId
      }`
    );

  });

  try {
    const pubKey = publicKeyString;
    const prvKey = privateKeyString;
    const response = await fetch(`http://localhost:${REGISTRY_PORT}/registerNode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodeId, pubKey, prvKey }),
    });

    if (response.ok) {
      console.log(`Node ${nodeId} registered successfully`);
    } else {
      console.error(`Failed to register node ${nodeId}`);
    }
  } catch (error) {
    console.error(`Error registering node ${nodeId}:`, error);
  }

  

  return server;
}

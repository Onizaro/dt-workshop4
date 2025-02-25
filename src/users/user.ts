import bodyParser from "body-parser";
import express from "express";
import { BASE_USER_PORT, REGISTRY_PORT } from "../config";
import crypto from "crypto";
import { createRandomSymmetricKey, symEncrypt, rsaEncrypt, rsaDecrypt, importSymKey, symDecrypt} from "../crypto";


export type SendMessageBody = {
  message: string;
  destinationUserId: number;
};

interface Node {
  nodeId: number;
  pubKey: string;
}

interface NodeRegistryResponse {
  nodes: Node[];
}

async function getNodeRegistry(): Promise<NodeRegistryResponse> {
  const response = await fetch("http://localhost:8080/getNodeRegistry");
  const data = await response.json();
  return data as NodeRegistryResponse;
}

export async function user(userId: number) {
  const _user = express();
  _user.use(express.json());
  _user.use(bodyParser.json());

  // TODO implement the status route
  _user.get("/status", (req, res) => {
    res.send("live");
  });

  let lastReceivedMessage: string | null = null;
  let lastSentMessage: string | null = null;
  

  _user.get("/getLastReceivedMessage", (req, res) => {
    res.send({ result: lastReceivedMessage });
  });

  _user.get("/getLastSentMessage", (req, res) => {
    res.json({ result: lastSentMessage });
  });

  async function getPrivateKey(port: number): Promise<string> {
    const response = await fetch(`http://localhost:${port}/getPrivateKey`);
    if (!response.ok) {
      throw new Error("Failed to retrieve private key");
    }
    const data = await response.json();
    return data.result;
  }

  _user.post("/message", async (req, res) => {
    const { message } = req.body;

    if (!message) {
        return res.status(400).json({ error: "Message is required" });
    }

    try {
        const port = req.socket.localPort; // Récupère le port du nœud actuel
        const response = await fetch(`http://localhost:${port}/getPrivateKey`);
        
        if (!response.ok) {
            throw new Error("Failed to retrieve private key");
        }

        const data = await response.json();
        const privateKeyBase64 = data.result;
        const privateKey = await importPrvKey(privateKeyBase64);

        // Décryptage de la première couche
        const encryptedKeyBase64 = message.slice(0, 344); // 2048-bit RSA en base64
        const encryptedPayload = message.slice(344);

        const decryptedKeyBase64 = await rsaDecrypt(encryptedKeyBase64, privateKey);
        const symmetricKey = await importSymKey(decryptedKeyBase64);

        const decryptedPayload = await symDecrypt(decryptedKeyBase64, encryptedPayload);

        console.log("Decrypted payload:", decryptedPayload);

        return res.json({ decryptedPayload });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to process message" });
    }
});


  _user.post("/sendMessage", async (req, res) => {
    const { message, destinationUserId } = req.body;
  
    if (!message || typeof destinationUserId !== "number") {
      return res.status(400).json({ error: "Invalid request body" });
    }
  
    try {
      const { nodes } = await getNodeRegistry();
      if (nodes.length < 3) {
        return res.status(500).json({ error: "Not enough nodes available" });
      }
  
      const circuit: Node[] = [];
      while (circuit.length < 3) {
        const node = nodes[Math.floor(Math.random() * nodes.length)];
        if (!circuit.includes(node)) circuit.push(node);
      }
  
      const symmetricKeys = await Promise.all(
        circuit.map(() => createRandomSymmetricKey())
      );
      
  
      let encryptedMessage = message;
      for (let i = 2; i >= 0; i--) {
        const destination = i === 2 
          ? destinationUserId.toString().padStart(10, "0") 
          : circuit[i + 1].nodeId.toString().padStart(10, "0");
  
        const payload = destination + encryptedMessage;
        const exportedKey = await crypto.subtle.exportKey("raw", symmetricKeys[i]);
        const encryptedKey = await rsaEncrypt(Buffer.from(exportedKey).toString("base64"), circuit[i].pubKey);

        
        const encryptedPayload = await symEncrypt(symmetricKeys[i], payload);
        
        encryptedMessage = encryptedKey + encryptedPayload;
      }
      await fetch(`http://localhost:${circuit[0].nodeId+4000}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: encryptedMessage }),
      });
      return res.json({ status: "success" });
  
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Failed to send message" });
    }
  });


  const server = _user.listen(BASE_USER_PORT + userId, () => {
    console.log(
      `User ${userId} is listening on port ${BASE_USER_PORT + userId}`
    );
  });

  

  return server;
}

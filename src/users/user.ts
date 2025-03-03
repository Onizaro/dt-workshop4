import bodyParser from "body-parser";
import express from "express";
import { BASE_USER_PORT, REGISTRY_PORT } from "../config";
import { webcrypto } from "crypto";
import crypto from "crypto";
import { createRandomSymmetricKey, symEncrypt, rsaEncrypt, rsaDecrypt, importSymKey, symDecrypt, importPrvKey} from "../crypto";


export type SendMessageBody = {
  message: string;
  destinationUserId: number;
};
let messagePort: number = 4000;

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

    const data = await response.json() as { result: string }; // Force l'assertion de type
    return data.result;
}
const symmetricKeyStore: { [nodeId: number]: webcrypto.CryptoKey } = {};


_user.post("/message", async (req, res) => {
  const { message } = req.body;
  console.log("node port: ", messagePort)

  if (!message) {
      return res.status(400).json({ error: "Invalid request body" });
  }

  try {
      let decryptedMessage = message;

      // Vérifier si le message est potentiellement chiffré (base64)
      if (/^[A-Za-z0-9+/=]+$/.test(message)) {
          try {
              const port = messagePort;
              const response = await fetch(`http://localhost:${port}/getPrivateKey`);
              

              if (!response.ok) {
                  throw new Error("Failed to retrieve private key");
              }

              const jsonResponse = await response.json() as { result: string }; // Parse le JSON
              const privateKeyPem = jsonResponse.result;
              const privateKey = await importPrvKey(privateKeyPem); 
              
              // curl -X POST http://localhost:3000/sendMessage -H "Content-Type: application/json" -d "{\"message\":\"Hello, world!\",\"destinationUserId\":1}"

              try {
                console.log("decrypted message:",decryptedMessage);
                // Extraire la clé symétrique chiffrée (344 caractères en base64) et le payload
                const encryptedKey = decryptedMessage.substring(0, 344); // Base64 encoded RSA-2048 key (~344 chars)
                const encryptedPayload = decryptedMessage.substring(344); // Le reste du message
            
                console.log("Encrypted key:", encryptedKey);
                console.log("Encrypted payload:", encryptedPayload);
            
                // Déchiffrement de la clé symétrique
                const decryptedKeyBase64 = await rsaDecrypt(encryptedKey, privateKey);
                console.log("Decrypted symmetric key (base64):", decryptedKeyBase64);
            
                const decryptedKeyBuffer = Buffer.from(decryptedKeyBase64, "base64");
                console.log("Decrypted symmetric key (buffer):", decryptedKeyBuffer.toString("hex"));
            
                // Vérifier si la clé symétrique existe
                const symmetricKey = symmetricKeyStore[messagePort]; 
                if (!symmetricKey) {
                    console.error("Symmetric key not found for port", messagePort);
                    return res.status(500).json({ error: "Symmetric key not found" });
                }
            
                console.log("Using symmetric key:", symmetricKey);
            
                // Déchiffrement du payload avec la clé symétrique
                const decryptedPayload = await symDecrypt(symmetricKey.toString(), encryptedPayload);
                console.log("Decrypted payload:", decryptedPayload);
            
                // Extraire l'adresse du prochain nœud et le message restant
                const nextNodeId = decryptedPayload.substring(0, 10).replace(/^0+/, ""); // Supprimer les zéros inutiles
                const remainingMessage = decryptedPayload.substring(10);
            
                console.log(`Forwarding to next node ${nextNodeId}:`, remainingMessage);
            
                // Vérifier si c'est le destinataire final ou un nœud intermédiaire
                if (parseInt(nextNodeId) >= 3000) {
                    console.log("Final recipient reached:", remainingMessage);
                    lastReceivedMessage = remainingMessage;
                    return res.send("success");
                } else {
                    const nextPort = parseInt(nextNodeId) + 4000;
                    await fetch(`http://localhost:${nextPort}/message`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ message: Buffer.from(remainingMessage).toString("base64") }),
                    });
                    messagePort = nextPort;
                    return res.send("forwarded");
                }
            } catch (error) {
                console.error("Decryption or forwarding error:", error);
                return res.status(500).json({ error: "Failed to process message" });
            }
            
            
          } catch (error) {
            console.log(error);
              console.warn("Message not encrypted or failed to decrypt. Storing as is.");
          }
      }
      console.log(decryptedMessage);
      lastReceivedMessage = decryptedMessage; 
      return res.send("success");
  } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Failed to process message" });
  }
});



  _user.post("/sendMessage", async (req, res) => {
    const { message, destinationUserId } = req.body;
    lastSentMessage = message;
  
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

      if (circuit[0] && circuit[0].nodeId !== undefined) {
        messagePort = circuit[0].nodeId + 4000;
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
    
        
        symmetricKeyStore[circuit[i].nodeId] = symmetricKeys[i];
    }

      if (!circuit[0] || circuit[0].nodeId === undefined) {
        return res.status(500).json({ error: "Invalid circuit" });
      }
      

      
      await fetch(`http://localhost:${destinationUserId+3000}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: Buffer.from(encryptedMessage).toString("base64") }),
      });
      console.log("message sent:",encryptedMessage)
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

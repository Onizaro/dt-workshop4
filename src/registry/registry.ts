import bodyParser from "body-parser";
import express, { Request, Response } from "express";
import { REGISTRY_PORT } from "../config";
import {exportPrvKey} from "src/crypto";



export type Node = { nodeId: number; pubKey: string, prvKey: string };

export type RegisterNodeBody = {
  nodeId: number;
  pubKey: string;
  prvKey: string;
};

export type GetNodeRegistryBody = {
  nodes: Node[];
};

const registeredNodes: Node[] = []; // Temporary storage

export async function launchRegistry() {
  const _registry = express();
  _registry.use(express.json());
  _registry.use(bodyParser.json());

  _registry.get("/status", (req, res) => {
    res.send("live");
  });

  _registry.post("/registerNode", (req, res) => {
    const { nodeId, pubKey, prvKey } = req.body;
  
    if (typeof nodeId !== "number" || typeof pubKey !== "string") {
      return res.status(400).json({ error: "Invalid node data" });
    }
  
    // Vérifier si le nœud est déjà enregistré
    if (registeredNodes.some((node) => node.nodeId === nodeId)) {
      return res.status(400).json({ error: "Node already registered" });
    }
  
    // Ajouter le nœud au registre
    registeredNodes.push({ nodeId, pubKey, prvKey });
  
    return res.status(200).json({ status: "success" });
  });
  
  _registry.get("/getNodeRegistry", (req, res) => {
    const formattedNodes = registeredNodes.map(({ nodeId, pubKey }) => ({
      nodeId,
      pubKey,
    }));
  
    res.json({ nodes: formattedNodes });
  });
  

  
  const server = _registry.listen(REGISTRY_PORT, () => {
    console.log(`Registry is listening on port ${REGISTRY_PORT}`);
  });

  return server;
}

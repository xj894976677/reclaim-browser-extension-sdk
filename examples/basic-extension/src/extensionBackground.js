import { reclaimExtensionSDK } from "@joclaim/browser-extension-sdk";

console.log("Background script starting...");
try {
  reclaimExtensionSDK.initializeBackground();
  console.log("Background initialized");
} catch (error) {
  console.error("Background script error:", error);
}

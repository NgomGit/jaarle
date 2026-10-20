import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  extractVerificationCode,
  parseWebhookMessages,
  verificationWaLink,
  verifyMetaSignature,
} from "../verification";

describe("extractVerificationCode", () => {
  it("lit les variantes courantes", () => {
    expect(extractVerificationCode("Code : JRL-482913")).toBe("482913");
    expect(extractVerificationCode("jrl 004213 merci")).toBe("004213");
    expect(extractVerificationCode("JRL482913")).toBe("482913");
  });
  it("refuse sans préfixe ou mauvaise longueur", () => {
    expect(extractVerificationCode("482913")).toBeNull();
    expect(extractVerificationCode("JRL-48291")).toBeNull();
    expect(extractVerificationCode("JRL-4829135")).toBeNull();
    expect(extractVerificationCode(undefined)).toBeNull();
  });
});

describe("verificationWaLink", () => {
  it("chiffres seuls + message encodé contenant le code", () => {
    const url = verificationWaLink("+221 77 000 00 01", "123456");
    expect(url.startsWith("https://wa.me/221770000001?text=")).toBe(true);
    expect(decodeURIComponent(url.split("text=")[1])).toContain("JRL-123456");
  });
});

describe("parseWebhookMessages", () => {
  it("extrait les messages texte et ignore les statuts", () => {
    const body = {
      entry: [
        {
          changes: [
            { value: { statuses: [{ id: "s1" }] } },
            { value: { messages: [{ id: "wamid.1", from: "221771234567", type: "text", text: { body: "JRL-111111" } }] } },
            { value: { messages: [{ id: "wamid.2", from: "221771234567", type: "image" }] } },
          ],
        },
      ],
    };
    expect(parseWebhookMessages(body)).toEqual([{ id: "wamid.1", from: "221771234567", replyTo: "221771234567", text: "JRL-111111" }]);
  });
  it("nom d'utilisateur : numéro absent → from null, numéro du contact sinon", () => {
    const hidden = { entry: [{ changes: [{ value: { contacts: [{ user_id: "SN.abc123" }], messages: [{ id: "w3", from: "SN.abc123", type: "text", text: { body: "JRL-222222" } }] } }] }] };
    expect(parseWebhookMessages(hidden)).toEqual([{ id: "w3", from: null, replyTo: "SN.abc123", text: "JRL-222222" }]);
    const viaContact = { entry: [{ changes: [{ value: { contacts: [{ wa_id: "221770000009", user_id: "SN.x" }], messages: [{ id: "w4", from: "SN.x", type: "text", text: { body: "JRL-333333" } }] } }] }] };
    expect(parseWebhookMessages(viaContact)[0].from).toBe("221770000009");
  });
  it("tolère un corps invalide", () => {
    expect(parseWebhookMessages(null)).toEqual([]);
    expect(parseWebhookMessages({ entry: "x" })).toEqual([]);
  });
});

describe("verifyMetaSignature", () => {
  const body = '{"entry":[]}';
  const sig = "sha256=" + createHmac("sha256", "secret").update(body).digest("hex");
  it("accepte la bonne signature", () => expect(verifyMetaSignature(body, sig, "secret")).toBe(true));
  it("refuse une signature fausse, absente ou un autre corps", () => {
    expect(verifyMetaSignature(body, sig, "autre")).toBe(false);
    expect(verifyMetaSignature(body + " ", sig, "secret")).toBe(false);
    expect(verifyMetaSignature(body, null, "secret")).toBe(false);
    expect(verifyMetaSignature(body, "sha256=zz", "secret")).toBe(false);
  });
});

describe("whatsappVerificationEnabled (vérification en pause)", () => {
  it("désactivée par défaut, même avec le numéro configuré", async () => {
    const { whatsappVerificationEnabled } = await import("@/lib/whatsapp/verification");
    expect(whatsappVerificationEnabled({})).toBe(false);
    expect(whatsappVerificationEnabled({ JAARLE_WHATSAPP_NUMBER: "+221770000000" })).toBe(false);
    expect(whatsappVerificationEnabled({ WHATSAPP_VERIFICATION_ENABLED: "on" })).toBe(false);
    expect(whatsappVerificationEnabled({ WHATSAPP_VERIFICATION_ENABLED: "on", JAARLE_WHATSAPP_NUMBER: "+221770000000" })).toBe(true);
  });
});

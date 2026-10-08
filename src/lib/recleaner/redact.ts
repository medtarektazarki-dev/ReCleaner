export function redact(text: string, keepKeys = false): string {
  let cut = text.slice(0, 24000);
  if (!keepKeys) {
    cut = cut.replace(/[A-Za-z0-9]{5}(?:-[A-Za-z0-9]{5}){4}/g, "XXXXX-XXXXX-XXXXX-XXXXX-XXXXX");
  }
  cut = cut.replace(/^.*(password|passphrase|key content|shared key)\s*[:=].*$/gim, "[redacted]");
  return cut;
}

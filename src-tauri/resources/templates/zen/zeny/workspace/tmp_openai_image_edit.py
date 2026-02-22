import base64, json, os, sys, uuid
from urllib import request

API_KEY = os.environ.get("OPENAI_API_KEY")
if not API_KEY:
    print("Missing OPENAI_API_KEY", file=sys.stderr)
    sys.exit(1)

in_path = sys.argv[1]
out_path = sys.argv[2]
prompt = sys.argv[3]

boundary = "----openclaw" + uuid.uuid4().hex

def part(name, value, filename=None, content_type=None, data=None):
    lines = []
    lines.append(f"--{boundary}")
    disp = f"Content-Disposition: form-data; name=\"{name}\""
    if filename is not None:
        disp += f"; filename=\"{filename}\""
    lines.append(disp)
    if content_type:
        lines.append(f"Content-Type: {content_type}")
    lines.append("")
    head = "\r\n".join(lines).encode("utf-8") + b"\r\n"
    body = data if data is not None else str(value).encode("utf-8")
    return head + body + b"\r\n"

with open(in_path, "rb") as f:
    img_bytes = f.read()

payload = b"".join([
    part("model", "gpt-image-1"),
    part("prompt", prompt),
    part("background", "transparent"),
    part("size", "1024x1024"),
    part("output_format", "png"),
    part("image", "", filename=os.path.basename(in_path), content_type="image/png", data=img_bytes),
    f"--{boundary}--\r\n".encode("utf-8"),
])

req = request.Request(
    "https://api.openai.com/v1/images/edits",
    data=payload,
    headers={
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": f"multipart/form-data; boundary={boundary}",
    },
    method="POST",
)

with request.urlopen(req, timeout=300) as resp:
    raw = resp.read()

obj = json.loads(raw)
if "data" not in obj or not obj["data"]:
    raise RuntimeError(f"Unexpected response: {obj}")

b64 = obj["data"][0].get("b64_json")
if not b64:
    raise RuntimeError(f"No b64_json in response: {obj[data][0].keys()}")

out_bytes = base64.b64decode(b64)
with open(out_path, "wb") as f:
    f.write(out_bytes)

print("WROTE", out_path)
print("MEDIA:", out_path)

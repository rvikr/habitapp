import { NextResponse } from "next/server";

const PACKAGE_NAME = "health.lagan.app";
const EAS_SIGNING_FINGERPRINT =
  "64:76:E6:6D:C8:EC:D8:D7:19:B9:0B:51:CF:A8:5D:2D:B7:23:38:1D:55:D2:14:7F:D1:39:70:AF:A4:E6:F8:FD";
const PLAY_APP_SIGNING_FINGERPRINT =
  "7B:D2:16:3E:CD:06:7D:4A:93:06:6E:B7:80:D2:11:18:E7:69:DD:D6:07:51:2B:1E:7E:5E:FA:22:AD:10:DB:C7";
const SHA256_FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

export function GET() {
  const configured = (process.env.ANDROID_APP_LINK_SHA256_FINGERPRINTS ?? "")
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value) => SHA256_FINGERPRINT.test(value));
  const fingerprints = [
    ...new Set([EAS_SIGNING_FINGERPRINT, PLAY_APP_SIGNING_FINGERPRINT, ...configured]),
  ];

  return NextResponse.json(
    [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: PACKAGE_NAME,
          sha256_cert_fingerprints: fingerprints,
        },
      },
    ],
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}

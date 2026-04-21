"""
Upload a local MP4 to Supabase Storage and print a signed URL you can pass
to `worker/enqueue.py --video-url ...`.

Usage:
    python worker/upload_test_video.py path/to/match.mp4
    python worker/upload_test_video.py path/to/match.mp4 --bucket test-videos --expires 86400

On first run, creates the bucket if it does not exist. The bucket is private —
only the signed URL can read the file, and it expires after `--expires`
seconds (default 24h). This is enough for a Modal worker to download it once
and toss it.

Uses plain `requests` to stay compatible with Python 3.14+.
"""

import argparse
import os
import sys
import time
from pathlib import Path

import requests
from dotenv import load_dotenv


def ensure_bucket(base: str, key: str, bucket: str) -> None:
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    r = requests.get(f"{base}/storage/v1/bucket/{bucket}", headers=headers, timeout=15)
    if r.status_code == 200:
        return
    if r.status_code != 404:
        r.raise_for_status()
    print(f"creating bucket '{bucket}' (private)")
    r = requests.post(
        f"{base}/storage/v1/bucket",
        headers={**headers, "Content-Type": "application/json"},
        json={"id": bucket, "name": bucket, "public": False},
        timeout=15,
    )
    r.raise_for_status()


def upload(base: str, key: str, bucket: str, local_path: Path) -> str:
    object_path = f"{int(time.time())}_{local_path.name}"
    url = f"{base}/storage/v1/object/{bucket}/{object_path}"
    print(f"uploading {local_path.name} -> {bucket}/{object_path} ({local_path.stat().st_size / 1e6:.1f} MB)")
    with local_path.open("rb") as f:
        r = requests.post(
            url,
            headers={
                "apikey": key,
                "Authorization": f"Bearer {key}",
                "Content-Type": "video/mp4",
                "x-upsert": "false",
            },
            data=f,
            timeout=600,
        )
    r.raise_for_status()
    return object_path


def sign(base: str, key: str, bucket: str, object_path: str, expires: int) -> str:
    r = requests.post(
        f"{base}/storage/v1/object/sign/{bucket}/{object_path}",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
        json={"expiresIn": expires},
        timeout=15,
    )
    r.raise_for_status()
    return f"{base}/storage/v1{r.json()['signedURL']}"


def main() -> int:
    load_dotenv(Path(__file__).resolve().parent.parent / ".env.local")

    parser = argparse.ArgumentParser()
    parser.add_argument("path", help="local path to the MP4")
    parser.add_argument("--bucket", default="test-videos")
    parser.add_argument("--expires", type=int, default=86400, help="signed URL TTL in seconds")
    args = parser.parse_args()

    local = Path(args.path).resolve()
    if not local.is_file():
        print(f"not a file: {local}", file=sys.stderr)
        return 1

    base = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

    ensure_bucket(base, key, args.bucket)
    object_path = upload(base, key, args.bucket, local)
    signed = sign(base, key, args.bucket, object_path, args.expires)

    print()
    print(f"signed URL (valid {args.expires}s):")
    print(signed)
    return 0


if __name__ == "__main__":
    sys.exit(main())

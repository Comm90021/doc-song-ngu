"""Create the Android release keystore (PKCS#12) for DocSongNgu.

Run:  uv run --no-project --with cryptography python tools/make_keystore.py

Writes:
  .secrets/release.p12   PKCS#12 keystore, alias "docsongngu"
  .secrets/keystore.txt  password, alias, created date, certificate SHA-256
Refuses to overwrite an existing .secrets/release.p12.
"""

import datetime as dt
import secrets
import string
import sys
from pathlib import Path

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.x509.oid import NameOID

ALIAS = "docsongngu"
ROOT = Path(__file__).resolve().parent.parent
SECRETS = ROOT / ".secrets"
P12_PATH = SECRETS / "release.p12"
TXT_PATH = SECRETS / "keystore.txt"


def main() -> int:
    SECRETS.mkdir(exist_ok=True)
    if P12_PATH.exists():
        print(f"REFUSED: {P12_PATH} already exists. Delete it manually to regenerate.")
        return 1

    alphabet = string.ascii_letters + string.digits
    password = "".join(secrets.choice(alphabet) for _ in range(24))

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name(
        [
            x509.NameAttribute(NameOID.COMMON_NAME, "DocSongNgu"),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Personal"),
        ]
    )
    now = dt.datetime.now(dt.timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - dt.timedelta(minutes=5))
        .not_valid_after(now + dt.timedelta(days=365 * 30))
        .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
        .sign(key, hashes.SHA256())
    )

    p12 = pkcs12.serialize_key_and_certificates(
        name=ALIAS.encode(),
        key=key,
        cert=cert,
        cas=None,
        encryption_algorithm=serialization.BestAvailableEncryption(password.encode()),
    )
    P12_PATH.write_bytes(p12)

    fingerprint = cert.fingerprint(hashes.SHA256()).hex().upper()
    fingerprint = ":".join(fingerprint[i : i + 2] for i in range(0, len(fingerprint), 2))
    TXT_PATH.write_text(
        "DocSongNgu Android release keystore\n"
        f"file: {P12_PATH}\n"
        f"password: {password}\n"
        f"alias: {ALIAS}\n"
        f"created: {now.date().isoformat()}\n"
        f"certificate SHA-256: {fingerprint}\n",
        encoding="utf-8",
    )

    # Sanity check: load it back.
    loaded_key, loaded_cert, _ = pkcs12.load_key_and_certificates(
        P12_PATH.read_bytes(), password.encode()
    )
    ok = loaded_key is not None and loaded_cert is not None
    print(f"Created {P12_PATH}")
    print(f"Created {TXT_PATH}")
    print(f"Certificate SHA-256: {fingerprint}")
    print("Round-trip load: " + ("OK" if ok else "FAILED"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())

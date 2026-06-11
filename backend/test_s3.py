"""Test isolé pour S3 — upload/download d'un fichier."""

import os
import boto3
from dotenv import load_dotenv

load_dotenv()

BUCKET_NAME = "debatecoach-baptiste-2026"  # Ton bucket

# Créer un client S3 avec les credentials AWS
s3 = boto3.client(
    "s3",
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
    aws_session_token=os.getenv("AWS_SESSION_TOKEN"),
    region_name=os.getenv("AWS_REGION", "us-east-1"),
)

# Test 1 : upload d'un fichier texte
print("Test 1 : upload...")
content = b"Bonjour depuis Python ! Ceci est un test S3."
s3.put_object(
    Bucket=BUCKET_NAME,
    Key="test/hello.txt",
    Body=content,
)
print(f"  Fichier uploadé : s3://{BUCKET_NAME}/test/hello.txt")

# Test 2 : lister le contenu du bucket
print("\nTest 2 : liste des fichiers...")
response = s3.list_objects_v2(Bucket=BUCKET_NAME)
if "Contents" in response:
    for obj in response["Contents"]:
        print(f"  - {obj['Key']} ({obj['Size']} octets)")
else:
    print("  (bucket vide)")

# Test 3 : télécharger le fichier
print("\nTest 3 : download...")
response = s3.get_object(Bucket=BUCKET_NAME, Key="test/hello.txt")
downloaded = response["Body"].read()
print(f"  Contenu téléchargé : {downloaded.decode('utf-8')}")

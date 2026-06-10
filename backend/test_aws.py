"""Test minimal AWS — liste les tables DynamoDB existantes."""

import os
import boto3
from dotenv import load_dotenv

load_dotenv()

# Créer un client DynamoDB
client = boto3.client(
    "dynamodb",
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
    aws_session_token=os.getenv("AWS_SESSION_TOKEN"),
    region_name=os.getenv("AWS_REGION", "us-east-1"),
)

# Lister les tables DynamoDB existantes
response = client.list_tables()
print("Tables DynamoDB existantes :")
for table in response.get("TableNames", []):
    print(f"  - {table}")

if not response.get("TableNames"):
    print("  (aucune table pour l'instant — normal)")

print("\nConnexion AWS DynamoDB : OK")
import os
import boto3
from botocore.exceptions import ClientError

TABLE_NAME = "DebateSessions"


def _get_table():
    dynamodb = boto3.resource(
        "dynamodb",
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
        aws_session_token=os.getenv("AWS_SESSION_TOKEN"),
        region_name=os.getenv("AWS_REGION", "us-east-1"),
    )
    return dynamodb.Table(TABLE_NAME)


def save_session(session_id: str, data: dict) -> None:
    persistable = {
        "session_id": session_id,
        "filename": data.get("filename", ""),
        "filenames": data.get("filenames", []),
        "document_text": data.get("document_text", ""),
        "ai_position": data.get("ai_position", ""),
        "level": data.get("level", "easy"),
        "history": data.get("history", []),
    }
    table = _get_table()
    try:
        table.put_item(Item=persistable)
        print(f"[DYNAMODB] Session {session_id} saved")
    except ClientError as e:
        print(f"[DYNAMODB ERROR] {e}")
        raise


def load_session(session_id: str) -> dict | None:
    table = _get_table()
    try:
        response = table.get_item(Key={"session_id": session_id})
        item = response.get("Item")
        if item is None:
            print(f"[DYNAMODB] Session {session_id} not found")
            return None
        print(f"[DYNAMODB] Session {session_id} loaded")
        return item
    except ClientError as e:
        print(f"[DYNAMODB ERROR] {e}")
        return None


def delete_session(session_id: str) -> None:
    table = _get_table()
    try:
        table.delete_item(Key={"session_id": session_id})
        print(f"[DYNAMODB] Session {session_id} deleted")
    except ClientError as e:
        print(f"[DYNAMODB ERROR] {e}")


def list_session_ids() -> list[str]:
    table = _get_table()
    try:
        response = table.scan(ProjectionExpression="session_id")
        return [item["session_id"] for item in response.get("Items", [])]
    except ClientError as e:
        print(f"[DYNAMODB ERROR] {e}")
        return []

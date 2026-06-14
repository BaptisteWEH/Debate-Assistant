import os
import json
import boto3
from botocore.exceptions import ClientError, NoCredentialsError

TABLE_NAME = "DebateSessions"
_SESSIONS_DIR = os.path.join(os.path.dirname(__file__), "..", ".sessions")


def _file_path(session_id: str) -> str:
    os.makedirs(_SESSIONS_DIR, exist_ok=True)
    return os.path.join(_SESSIONS_DIR, f"{session_id}.json")


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
        "user_id": data.get("user_id", ""),
        "topic_summary": data.get("topic_summary", ""),
        "created_at": data.get("created_at", ""),
    }
    try:
        table = _get_table()
        table.put_item(Item=persistable)
        print(f"[DYNAMODB] Session {session_id} saved")
        return
    except (ClientError, NoCredentialsError, Exception) as e:
        print(f"[DYNAMODB WARN] Falling back to file store: {e}")

    with open(_file_path(session_id), "w") as f:
        json.dump(persistable, f)
    print(f"[FILE STORE] Session {session_id} saved")


def load_session(session_id: str) -> dict | None:
    try:
        table = _get_table()
        response = table.get_item(Key={"session_id": session_id})
        item = response.get("Item")
        if item is not None:
            print(f"[DYNAMODB] Session {session_id} loaded")
            return item
        print(f"[DYNAMODB] Session {session_id} not found")
    except (ClientError, NoCredentialsError, Exception) as e:
        print(f"[DYNAMODB WARN] Falling back to file store: {e}")

    path = _file_path(session_id)
    if os.path.exists(path):
        with open(path) as f:
            print(f"[FILE STORE] Session {session_id} loaded")
            return json.load(f)
    return None


def delete_session(session_id: str) -> None:
    try:
        table = _get_table()
        table.delete_item(Key={"session_id": session_id})
        print(f"[DYNAMODB] Session {session_id} deleted")
    except (ClientError, NoCredentialsError, Exception) as e:
        print(f"[DYNAMODB WARN] {e}")

    path = _file_path(session_id)
    if os.path.exists(path):
        os.remove(path)
        print(f"[FILE STORE] Session {session_id} deleted")


def list_session_ids() -> list[str]:
    try:
        table = _get_table()
        response = table.scan(ProjectionExpression="session_id")
        return [item["session_id"] for item in response.get("Items", [])]
    except (ClientError, NoCredentialsError, Exception) as e:
        print(f"[DYNAMODB WARN] {e}")

    if not os.path.exists(_SESSIONS_DIR):
        return []
    return [
        f[:-5] for f in os.listdir(_SESSIONS_DIR) if f.endswith(".json")
    ]

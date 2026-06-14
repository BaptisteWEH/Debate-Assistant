import os
from dotenv import load_dotenv
import google.generativeai as genai

load_dotenv()

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

for model in genai.list_models():
    print("\nMODEL:", model.name)

    if hasattr(model, "supported_generation_methods"):
        print("METHODS:", model.supported_generation_methods)
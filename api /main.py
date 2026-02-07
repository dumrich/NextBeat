from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

app = FastAPI(title="NextBeat API", version="1.0.0")

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure as needed
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



if __name__ == "__main__":
    # Run with static IP binding
    uvicorn.run(
        "main:app",
        host="0.0.0.0",  # Bind to all interfaces (or specify your static IP)
        port=8000,
        reload=True
    )

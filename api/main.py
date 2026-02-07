import tempfile
import os

from fastapi import FastAPI, UploadFile, File
from fastapi.responses import Response
from basic_pitch.inference import predict

app = FastAPI()


@app.post("/convert")
async def convert_mp3_to_midi(file: UploadFile = File(...)):
    with tempfile.TemporaryDirectory() as tmpdir:
        input_path = os.path.join(tmpdir, file.filename or "input.mp3")
        output_path = os.path.join(tmpdir, "output.mid")

        with open(input_path, "wb") as f:
            f.write(await file.read())

        _, midi_data, _ = predict(input_path)
        midi_data.write(output_path)

        with open(output_path, "rb") as f:
            midi_bytes = f.read()

    return Response(
        content=midi_bytes,
        media_type="audio/midi",
        headers={"Content-Disposition": 'attachment; filename="output.mid"'},
    )

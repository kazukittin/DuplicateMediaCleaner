import argparse
import warnings
import uvicorn
import socketio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Suppress noisy but harmless Pillow EXIF warnings
warnings.filterwarnings('ignore', message='Corrupt EXIF data', category=UserWarning)
warnings.filterwarnings('ignore', message='Possibly corrupt EXIF data', category=UserWarning)
warnings.filterwarnings('ignore', category=UserWarning, module='PIL')

from .api.websocket_handler import sio
from .db.models import init_db
from .db.cache import init_cache


def create_app() -> FastAPI:
    init_db()
    init_cache()

    app = FastAPI(title='DuplicateMediaCleaner Backend')
    app.add_middleware(
        CORSMiddleware,
        allow_origins=['*'],
        allow_methods=['*'],
        allow_headers=['*'],
    )

    @app.get('/health')
    async def health():
        return {'status': 'ok'}

    socket_app = socketio.ASGIApp(sio, other_asgi_app=app)
    return socket_app


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--host', default='127.0.0.1')
    args = parser.parse_args()

    app = create_app()
    uvicorn.run(app, host=args.host, port=args.port, log_level='info')


if __name__ == '__main__':
    main()

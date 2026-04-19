from sqlalchemy import create_engine, Column, String, Integer, Float, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.orm import DeclarativeBase, relationship
from datetime import datetime
import os

DB_PATH = os.path.join(os.path.expandvars('%APPDATA%'), 'DuplicateMediaCleaner', 'cache.db')
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

engine = create_engine(
    f'sqlite:///{DB_PATH}',
    echo=False,
    connect_args={"check_same_thread": False},
)


class Base(DeclarativeBase):
    pass


class ScanSession(Base):
    __tablename__ = 'scan_sessions'
    id = Column(String, primary_key=True)
    folder_path = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    total_files = Column(Integer, default=0)
    duplicate_groups = Column(Integer, default=0)
    similar_groups = Column(Integer, default=0)
    files = relationship('FileRecord', back_populates='session', cascade='all, delete-orphan')


class FileRecord(Base):
    __tablename__ = 'files'
    id = Column(String, primary_key=True)
    session_id = Column(String, ForeignKey('scan_sessions.id'))
    path = Column(String, nullable=False)
    size = Column(Integer, default=0)
    modified = Column(String)
    file_type = Column(String)  # 'image' or 'video'
    sha256 = Column(String)
    phash = Column(String)
    dhash = Column(String)
    resolution = Column(String)
    duration = Column(Float)
    thumbnail_b64 = Column(Text)
    group_id = Column(String)
    category = Column(String)
    similarity = Column(Float, default=0)
    is_keep = Column(Boolean, default=False)
    session = relationship('ScanSession', back_populates='files')


def init_db():
    Base.metadata.create_all(engine)

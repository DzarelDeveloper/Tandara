import sys
import os
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ['DATABASE_URL'] = f"sqlite:///{Path(__file__).resolve().parents[1] / 'data' / 'tandara_test.db'}"

# worker/tests/test_backup.py
from ggrstats import backup

class FakeSession:
    def __init__(self): self.posts = []
    def post(self, url, data=None, json=None, headers=None, timeout=None):
        self.posts.append((url, headers.get("x-upsert")))
        class R:
            status_code = 200
            def raise_for_status(self): pass
            def json(self): return []
        return R()

def test_upload_files_posts_each_file_with_upsert(tmp_path):
    files = [tmp_path / "leaderboard.20260916T0012.gz", tmp_path / "RaceSetup.20260916T0012.gz"]
    for f in files: f.write_bytes(b"x")
    s = FakeSession()
    assert backup.upload_files(files, url="https://x.supabase.co", key="k", session=s) == 2
    assert s.posts[0] == ("https://x.supabase.co/storage/v1/object/raw-snapshots/ggr2026/leaderboard.20260916T0012.gz", "true")

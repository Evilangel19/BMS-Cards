"""The BMS files of the browser tests (tests/fixtures, app/js/data/local: gitignored, made from the files of the developer). A test whose files or
Python modules are missing prints SKIP and ends with success, so tools/run-all.py tells a missing file from a failure."""
import importlib.util, os, subprocess, sys

R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _skip(what):
    print('SKIP needs ' + what)
    sys.exit(0)


def need(*rel):
    """rel: paths from the root of the repository (tests/fixtures/..., app/js/data/local/...)."""
    for p in rel:
        if not os.path.exists(os.path.join(R, p)):
            _skip(p + ' (a BMS file, not in the repository)')


def need_module(*names):
    for n in names:
        if importlib.util.find_spec(n) is None:
            _skip('the Python module ' + n + ' (pip install ' + n + ')')


def need_tag(tag):
    if subprocess.run(['git', '-C', R, 'rev-parse', '-q', '--verify', 'refs/tags/' + tag], capture_output=True).returncode:
        _skip('the git tag ' + tag + ' (a full clone: git fetch --tags)')

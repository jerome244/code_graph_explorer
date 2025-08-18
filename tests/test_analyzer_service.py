import pytest
from core.services.analyzer import analyze_zip

pytestmark = pytest.mark.django_db

def _has_edge(edges, source_suffix, target_suffix, typ):
    return any(
        e["type"] == typ and e["source"].endswith(source_suffix) and e["target"].endswith(target_suffix)
        for e in edges
    )

def test_analyzer_resolves_cross_file_python_calls(zip_factory):
    zbytes = zip_factory({
        "a.py": "def foo():\n    bar()\n",
        "b.py": "def bar():\n    pass\n",
    })
    result = analyze_zip(zbytes)
    edges = result["edges"]
    # foo (declared in a.py) should call bar (declared in b.py)
    assert _has_edge(edges, ":foo@a.py", ":bar@b.py", "calls")

def test_analyzer_matches_html_css_ids_and_classes(zip_factory):
    zbytes = zip_factory({
        "index.html": '<div id="hero" class="card main"></div>',
        "styles.css": "#hero{color:red}.card{border:1px solid}.other{ }",
    })
    r = analyze_zip(zbytes)
    # ids/classes counted
    assert r["summary"]["html_ids"] == 1
    assert r["summary"]["html_classes"] == 2
    assert r["summary"]["css_ids"] == 1
    assert r["summary"]["css_classes"] == 2
    # styled-by edges exist for id and class
    styled_edges = [e for e in r["edges"] if e["type"] == "styled-by"]
    assert any(e["source"].startswith("html-id:hero@") and e["target"].startswith("css-id:hero@") for e in styled_edges)
    assert any(e["source"].startswith("html-class:card@") and e["target"].startswith("css-class:card@") for e in styled_edges)

def test_analyzer_resolves_js_calls(zip_factory):
    z = zip_factory({
        "a.js": "function foo(){ bar() }",
        "b.js": "function bar(){ return 1 }",
    })
    r = analyze_zip(z)
    edges = [e for e in r["edges"] if e["type"] == "calls"]
    assert any(e["source"].endswith(":foo@a.js") and e["target"].endswith(":bar@b.js") for e in edges)

def test_analyzer_resolves_c_calls(zip_factory):
    z = zip_factory({
        "a.c": "void foo(){ bar(); }",
        "b.c": "int bar(){ return 0; }",
    })
    r = analyze_zip(z)
    edges = [e for e in r["edges"] if e["type"] == "calls"]
    assert any(e["source"].endswith(":foo@a.c") and e["target"].endswith(":bar@b.c") for e in edges)
    
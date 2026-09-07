from config.settings.host_utils import normalize_allowed_host, production_allowed_hosts


def test_normalize_strips_https_origin_to_hostname():
    assert normalize_allowed_host("https://api.example.com/path") == "api.example.com"
    assert normalize_allowed_host("http://localhost:8000") == "localhost"


def test_railway_healthcheck_host_is_always_included():
    hosts = production_allowed_hosts(["api.example.com"], {})
    assert "api.example.com" in hosts
    assert "healthcheck.railway.app" in hosts


def test_railway_injected_domains_are_merged():
    hosts = production_allowed_hosts(
        [],
        {
            "RAILWAY_PUBLIC_DOMAIN": "efop-api.up.railway.app",
            "RAILWAY_PRIVATE_DOMAIN": "efop-api.railway.internal",
        },
    )
    assert "efop-api.up.railway.app" in hosts
    assert "efop-api.railway.internal" in hosts
    assert "healthcheck.railway.app" in hosts

# Cell 1: Clean setup
import os
import urllib3
import requests
import httpx


def disable_httpx_over_ssl(self, *args, **kwargs):
    _original_client_init = httpx.Client.__init__
    kwargs.setdefault("verify", False)
    httpx.Client.__init__ = _original_client_init(self, *args, **kwargs)


def disable_session_over_ssl():
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

    original_request = requests.Session.request

    def no_ssl_request(self, method, url, **kwargs):
        kwargs.setdefault('verify', False)
        return original_request(self, method, url, **kwargs)

    requests.Session.request = no_ssl_request
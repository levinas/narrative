"""
Module to monkeypatch the parts of the IPython core that we don't/won't rewrite

Yes, its nasty.
No, we wouldn't use these if there were an alternative

We use some code that GvR posted here as helpers:
https://mail.python.org/pipermail/python-dev/2008-January/076194.html

sychan@lbl.gov

"""

import os
import urllib
import re
import IPython.html.notebook.handlers
import IPython.html.services.notebooks.handlers

def monkeypatch_method(cls):
    """
    To use:
    from <somewhere> import <someclass>

    @monkeypatch_method(<someclass>)
    def <newmethod>(self, args):
        return <whatever>

    This adds <newmethod> to <someclass>
    """
    def decorator(func):
        setattr(cls, func.__name__, func)
        return func
    return decorator

def monkeypatch_class(name, bases, namespace):
    """
    To use:
    from <somewhere> import <someclass>
    class <newclass>(<someclass>):
        __metaclass__ = monkeypatch_class
        def <method1>(...): ...
        def <method2>(...): ...
        ...

    This adds <method1>, <method2>, etc. to <someclass>, and makes
    <newclass> a local alias for <someclass>.
    """
    assert len(bases) == 1, "Exactly one base class required"

IPython.html.base.handlers.app_log.debug("Monkeypatching IPython.html.notebook.handlers.NamedNotebookHandler.get() in process {}".format(os.getpid()))

cookierx = re.compile('([^ =|]+)=([^\|]*)')
def parsecookie( cookie):
    """ Parser for Jim Thomason's login widget cookies """
    sess = { k : v.replace('EQUALSSIGN','=').replace('PIPESIGN','|')
             for k,v in cookierx.findall(urllib.unquote(cookie)) }
    return sess

old_get = IPython.html.notebook.handlers.NamedNotebookHandler.get
@monkeypatch_method(IPython.html.notebook.handlers.NamedNotebookHandler)
def get(self,notebook_id):
    if 'kbase_session' in self.cookies:
        kb_sess = parsecookie( self.cookies['kbase_session'].value)
        IPython.html.base.handlers.app_log.debug("token = " + kb_sess.get('token'))
        if hasattr(self,'notebook_manager'):
            setattr(self.notebook_manager,'kbase_token', kb_sess.get('token'))
    return old_get(self,notebook_id)

IPython.html.base.handlers.app_log.debug("Monkeypatching IPython.html.services.notebooks.handlers.NotebookRootHandler.get() in process {}".format(os.getpid()))
old_get1 = IPython.html.services.notebooks.handlers.NotebookRootHandler.get
@monkeypatch_method(IPython.html.services.notebooks.handlers.NotebookRootHandler)
def get(self):
    if 'kbase_session' in self.cookies:
        kb_sess = parsecookie( self.cookies['kbase_session'].value)
        IPython.html.base.handlers.app_log.debug("token = " + kb_sess.get('token'))
        if hasattr(self,'notebook_manager'):
            setattr(self.notebook_manager,'kbase_token', kb_sess.get('token'))
    return old_get1(self)

// 電波がなくても、一度開いたページは開けるようにする（中身は Q キット共通の line-share/shared/sw-core.js。CONNEQT_TOOL は Q キットが読む名前なのでそのまま）
self.CONNEQT_TOOL = "saqsen";
importScripts("/line-share/shared/sw-core.js");

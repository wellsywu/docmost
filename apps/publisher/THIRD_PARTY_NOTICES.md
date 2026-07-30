# Third-party notices

The server renderer under `src/rendering/` is original code. Its behaviour is
modelled on doocs/md — numbered link references, inlined syntax colours, and
diagrams rasterized to images — because those are the conventions a WeChat
article body requires. No doocs/md source is copied or vendored here, and the
stylesheet is our own.

doocs/md is distributed under the WTFPL. Its source is available at
https://github.com/doocs/md.

Runtime dependencies carry their own licenses; see each package in
`package.json`.

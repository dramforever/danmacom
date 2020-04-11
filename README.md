# Danmacom

## Features

Danmacom is an extension for livecoding in VSCode. It turns chat messages into
comments. Whenever a message like `/README:5 Test` appears, it finds a file with
a name that contains `README`, and puts a comment on the line `5`:

![Image showing comment on line `5`](images/comment_demo.png)

It also gathers messages into a terminal, and puts a status bar icon which shows
the terminal on click, and also shows a 'notification count'. Click the icon or
press space or enter in terminal to clear the count.

## Backend

Danmacom requires a backend. Currently the only backend is for Bilibili, which
is available in `backend/danmaku.py`. The protocol is considered internal, but
it is currently as follows:

- `stderr` is logged but otherwise ignored
- Each line in `stdout` is parsed as JSON and should contain
    - `author`: Name of the author
    - `face`: URL to avatar icon
    - `content`: Text of message

To use this backend, set `danmacom.program` to `python3 -u /path/to/danmaku.py
<live_id>`. `-u` is important to avoid buffering.

## Chatroom usage

Starting a thread: `/keyword[:line] comment`

- `keyword` is any substring of file name, matched case-insensitively, and it
  works as long as it uniquely identifies a file
- `line` is a line number, starting from 1
- If you specify a line number, the comment will be attached to that line.
  Otherwise it's attached to the file.

Example:

- `/README:5 This is a test` will put `This is a test` at line number `5` of the
  file whose name has `README` in it
- `/README This is a test` will put the comment in the same file, but at the top
- `/README:1 This is a test` is also at the top of the file, but is considered a
  separate thread.

Threads: Each file/line comment or just file comment is assigned a thread, and a
thread is identified by a number. Threads are automatically created with its
first comment. You can see the thread number at the code lens of that line, or
in the opened comments view.

To append to a thread, use `/num comment`, where `num` is all digits. (This
takes precedence over `/file comment`. If you really want to use an all-digits
keyword, use `/123:`.) Using an identical `/file` or `/file:line` has the same
effect as using the thread number.

Examples

- `/1 This is a test` will append `This is a test` to thread `1`.

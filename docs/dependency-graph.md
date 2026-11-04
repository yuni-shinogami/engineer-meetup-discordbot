# 依存関係の図

`npm run deps:graph` で作り直す（手で書き換えない）。矢印は「import している → されている」。
フォルダーの枠だけのもの（features の各機能・commands など）は、中のファイルを 1 つにまとめている。

```mermaid
flowchart LR

subgraph 0["src"]
subgraph 1["canva"]
2[" "]
end
subgraph 3["discordbot"]
subgraph 4["activity"]
5[" "]
end
subgraph 6["commands"]
7[" "]
end
8["config.ts"]
9["discord-event.ts"]
A["executor.ts"]
subgraph B["features"]
subgraph C["lt"]
D[" "]
end
end
E["handlers.ts"]
F["index.ts"]
G["interactions.ts"]
H["lt-recorder.ts"]
I["meetup.ts"]
J["scheduler.ts"]
subgraph K["shared"]
L["interaction.ts"]
M["meetup-dates.ts"]
N["x-post-url.ts"]
end
O["slides.ts"]
P["storage.ts"]
Q["vrc-event.ts"]
R["vrc-invite.ts"]
S["vrc-launcher.ts"]
T["vrc-links.ts"]
U["vrceve.ts"]
end
subgraph V["image-gen"]
W[" "]
end
subgraph X["video"]
Y[" "]
end
subgraph Z["vrchat"]
10[" "]
end
subgraph 11["x"]
12[" "]
end
end
5-->8
7-->8
7-->L
7-->9
7-->I
7-->J
7-->O
7-->P
7-->Q
7-->U
7-->10
7-->H
7-->R
7-->S
7-->T
7-->D
7-->12
7-->M
7-->N
9-->8
9-->D
9-->P
9-->Q
9-->U
D-->10
D-->12
D-->8
D-->N
D-->M
D-->W
D-->L
D-->G
E-->7
E-->D
E-->G
E-->H
E-->I
E-->R
E-->S
F-->5
F-->7
F-->8
F-->D
F-->E
F-->G
F-->J
H-->8
H-->D
H-->G
H-->L
H-->M
H-->S
I-->12
I-->8
I-->G
I-->M
I-->N
I-->P
J-->8
J-->D
J-->I
J-->P
L-->8
M-->8
N-->8
O-->2
O-->Y
O-->8
O-->M
P-->10
P-->8
Q-->10
Q-->D
Q-->P
Q-->U
R-->10
R-->G
R-->L
R-->S
R-->T
S-->10
S-->8
S-->G
S-->L
T-->10
T-->8
U-->8
U-->D
U-->P
```

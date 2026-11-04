# 依存関係の図

`npm run deps:graph` で作り直す（手で書き換えない）。矢印は「import している → されている」。
フォルダーの枠だけのもの（lt・commands など）は、中のファイルを 1 つにまとめている。

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
B["handlers.ts"]
C["index.ts"]
D["interactions.ts"]
E["lt-recorder.ts"]
subgraph F["lt"]
G[" "]
end
H["meetup.ts"]
I["scheduler.ts"]
subgraph J["shared"]
K["interaction.ts"]
L["meetup-dates.ts"]
M["x-post-url.ts"]
end
N["slides.ts"]
O["storage.ts"]
P["vrc-event.ts"]
Q["vrc-invite.ts"]
R["vrc-launcher.ts"]
S["vrc-links.ts"]
T["vrceve.ts"]
end
subgraph U["image-gen"]
V[" "]
end
subgraph W["video"]
X[" "]
end
subgraph Y["vrchat"]
Z[" "]
end
subgraph 10["x"]
11[" "]
end
end
5-->8
7-->8
7-->K
7-->9
7-->H
7-->I
7-->N
7-->O
7-->P
7-->T
7-->Z
7-->E
7-->Q
7-->R
7-->S
7-->V
7-->D
7-->G
7-->M
7-->L
7-->11
9-->8
9-->G
9-->O
9-->P
9-->T
B-->7
B-->D
B-->E
B-->G
B-->H
B-->Q
B-->R
C-->5
C-->7
C-->8
C-->B
C-->D
C-->G
C-->I
E-->8
E-->D
E-->G
E-->K
E-->L
E-->R
G-->8
G-->L
G-->Z
G-->11
G-->M
G-->D
G-->K
G-->V
H-->11
H-->8
H-->D
H-->L
H-->M
H-->O
I-->8
I-->G
I-->H
I-->O
K-->8
L-->8
M-->8
N-->2
N-->X
N-->8
N-->L
O-->Z
O-->8
P-->Z
P-->G
P-->O
P-->T
Q-->Z
Q-->D
Q-->K
Q-->R
Q-->S
R-->Z
R-->8
R-->D
R-->K
S-->Z
S-->8
T-->8
T-->G
T-->O
```

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
J["slides.ts"]
K["storage.ts"]
L["vrc-event.ts"]
M["vrc-invite.ts"]
N["vrc-launcher.ts"]
O["vrc-links.ts"]
P["vrceve.ts"]
end
subgraph Q["image-gen"]
R[" "]
end
subgraph S["video"]
T[" "]
end
subgraph U["vrchat"]
V[" "]
end
subgraph W["x"]
X[" "]
end
end
2-->8
5-->8
7-->8
7-->9
7-->H
7-->I
7-->J
7-->K
7-->L
7-->P
7-->V
7-->E
7-->M
7-->N
7-->O
7-->R
7-->X
7-->D
7-->G
9-->8
9-->G
9-->K
9-->L
9-->P
B-->7
B-->D
B-->E
B-->G
B-->H
B-->M
B-->N
C-->5
C-->7
C-->8
C-->B
C-->D
C-->G
C-->I
E-->7
E-->8
E-->D
E-->G
E-->N
G-->8
G-->V
G-->X
G-->D
G-->7
G-->R
H-->X
H-->8
H-->D
H-->K
I-->8
I-->G
I-->H
I-->K
J-->2
J-->T
J-->8
J-->G
K-->V
K-->8
L-->V
L-->G
L-->K
L-->P
M-->V
M-->7
M-->D
M-->N
M-->O
N-->V
N-->7
N-->8
N-->D
O-->V
O-->8
P-->8
P-->G
P-->K
X-->8
X-->G
```

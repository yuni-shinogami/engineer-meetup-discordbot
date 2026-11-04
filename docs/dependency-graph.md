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
L["x-post-url.ts"]
end
M["slides.ts"]
N["storage.ts"]
O["vrc-event.ts"]
P["vrc-invite.ts"]
Q["vrc-launcher.ts"]
R["vrc-links.ts"]
S["vrceve.ts"]
end
subgraph T["image-gen"]
U[" "]
end
subgraph V["video"]
W[" "]
end
subgraph X["vrchat"]
Y[" "]
end
subgraph Z["x"]
10[" "]
end
end
5-->8
7-->8
7-->K
7-->9
7-->H
7-->I
7-->M
7-->N
7-->O
7-->S
7-->Y
7-->E
7-->P
7-->Q
7-->R
7-->U
7-->D
7-->G
7-->L
7-->10
9-->8
9-->G
9-->N
9-->O
9-->S
B-->7
B-->D
B-->E
B-->G
B-->H
B-->P
B-->Q
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
E-->Q
G-->8
G-->Y
G-->10
G-->L
G-->D
G-->K
G-->U
H-->10
H-->8
H-->D
H-->G
H-->L
H-->N
I-->8
I-->G
I-->H
I-->N
K-->8
L-->8
M-->2
M-->W
M-->8
M-->G
N-->Y
N-->8
O-->Y
O-->G
O-->N
O-->S
P-->Y
P-->D
P-->K
P-->Q
P-->R
Q-->Y
Q-->8
Q-->D
Q-->K
R-->Y
R-->8
S-->8
S-->G
S-->N
```

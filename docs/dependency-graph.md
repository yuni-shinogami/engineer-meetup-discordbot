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
9["executor.ts"]
subgraph A["features"]
subgraph B["calendar"]
C[" "]
end
subgraph D["lt"]
E[" "]
end
subgraph F["meetup"]
G[" "]
end
subgraph H["slides"]
I[" "]
end
end
J["handlers.ts"]
K["index.ts"]
L["interactions.ts"]
M["lt-recorder.ts"]
N["scheduler.ts"]
subgraph O["shared"]
P["interaction.ts"]
Q["meetup-dates.ts"]
R["x-post-url.ts"]
end
S["storage.ts"]
T["vrc-invite.ts"]
U["vrc-launcher.ts"]
V["vrc-links.ts"]
end
subgraph W["image-gen"]
X[" "]
end
subgraph Y["video"]
Z[" "]
end
subgraph 10["vrchat"]
11[" "]
end
subgraph 12["x"]
13[" "]
end
end
5-->8
7-->8
7-->P
7-->11
7-->M
7-->S
7-->T
7-->U
7-->V
7-->L
7-->E
7-->N
7-->Q
C-->8
C-->S
C-->E
C-->11
C-->L
C-->P
E-->11
E-->13
E-->8
E-->R
E-->Q
E-->L
E-->X
E-->P
G-->L
G-->8
G-->P
G-->S
G-->C
G-->I
G-->13
G-->Q
G-->R
G-->E
G-->11
I-->L
I-->P
I-->2
I-->Z
I-->8
I-->Q
J-->L
J-->M
J-->T
J-->U
K-->5
K-->7
K-->8
K-->C
K-->E
K-->G
K-->I
K-->J
K-->L
K-->N
M-->8
M-->E
M-->L
M-->P
M-->Q
M-->U
N-->G
P-->8
Q-->8
R-->8
S-->11
S-->8
T-->11
T-->L
T-->P
T-->U
T-->V
U-->11
U-->8
U-->L
U-->P
V-->11
V-->8
```

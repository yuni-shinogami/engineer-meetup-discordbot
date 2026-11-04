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
subgraph D["instance"]
E[" "]
end
subgraph F["lt"]
G[" "]
end
subgraph H["meetup"]
I[" "]
end
subgraph J["slides"]
K[" "]
end
end
L["index.ts"]
M["interactions.ts"]
N["scheduler.ts"]
subgraph O["shared"]
P["interaction.ts"]
Q["meetup-dates.ts"]
R["x-post-url.ts"]
end
S["storage.ts"]
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
7-->P
7-->M
7-->G
7-->N
7-->Q
7-->S
C-->8
C-->S
C-->G
C-->Y
C-->M
C-->P
E-->Y
E-->8
E-->P
E-->S
E-->M
E-->Q
E-->G
G-->Y
G-->10
G-->8
G-->R
G-->Q
G-->M
G-->U
G-->P
I-->M
I-->8
I-->P
I-->S
I-->C
I-->K
I-->10
I-->Q
I-->R
I-->G
I-->Y
K-->M
K-->P
K-->2
K-->W
K-->8
K-->Q
L-->5
L-->7
L-->8
L-->C
L-->E
L-->G
L-->I
L-->K
L-->M
L-->N
N-->I
P-->8
Q-->8
R-->8
S-->Y
S-->8
```

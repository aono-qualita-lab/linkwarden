# Linkwarden 高負荷再発防止の実装計画（根本原因の修正）

前回適用したサーバー（Nginx）側のレートリミットおよび環境変数の調整に加え、**「そもそも高負荷を引き起こす原因となっていたLinkwardenの検索クエリ処理（プログラムの根本原因）」**を修正する計画です。

## ユーザー確認事項
> [!IMPORTANT]
> 調査の結果、ブラウザ拡張機能等は「現在見ているページが登録済みか」を判定するために `url:https://...` という形式で高頻度に検索APIを叩いていることが分かりました。
> しかし、Linkwardenの元のプログラムは、このリクエストを受け取った際に「インデックスの効かない非常に重い部分一致検索（フルテーブルスキャン）」をデータベースに対して何重にも実行する非効率な設計になっていました。
> 
> 本修正では、`url:` 指定の検索が送られてきた場合に、重い検索処理をすべてバイパスし、**データベースのインデックスが適用される「超高速なURL完全一致クエリ」へショートカットする修正**を行います。これにより、どれだけ高頻度でAPIが叩かれてもCPU負荷がほぼゼロ（ミリ秒未満で完了）になります。

## 提案する変更内容

### 1. Linkwarden 検索コントローラーの修正
`/link/api/v1/search` の実体である `searchLinks.ts` を修正し、`url:` トークンのみの検索である場合は、高速な完全一致クエリを直接投げて即座にレスポンスを返すショートカットロジックを実装します。

#### [MODIFY] [searchLinks.ts](file:///home/bob/www/shirokumaworks.jp/link/apps/web/lib/api/controllers/search/searchLinks.ts)
- `parseSearchTokens` を検索処理の最序盤で実行します。
- `url` 検索のみが指定されている場合（拡張機能からのアクセス時のパターン）は、Meilisearch や DB の `contains` (LIKE) 検索をバイパスし、`url` の等価比較（完全一致）で直接 `prisma.link.findMany` を呼び出します。

##### 具体的なコード修正イメージ:
```typescript
  // 検索トークンのパースを最序盤で実行
  const tokens = query.searchQueryString ? parseSearchTokens(query.searchQueryString) : [];

  // 「url:http...」の完全一致検索のみが指定されている場合の高速ショートカット
  if (tokens.length === 1 && tokens[0].field === "url" && !tokens[0].isNegative) {
    const targetUrl = tokens[0].value;
    const links = await prisma.link.findMany({
      take: paginationTakeCount,
      where: {
        url: targetUrl,
        AND: [
          ...(userId
            ? [
                {
                  collection: {
                    OR: [
                      { ownerId: userId },
                      {
                        members: {
                          some: { userId },
                        },
                      },
                    ],
                  },
                },
              ]
            : []),
          ...collectionCondition,
        ],
      },
      omit: {
        textContent: true,
      },
      include: {
        tags: true,
        collection: true,
        pinnedBy: userId
          ? {
              where: { id: userId },
              select: { id: true },
            }
          : undefined,
      },
      orderBy: order,
    });

    return {
      data: {
        links,
        nextCursor: null,
      },
      statusCode: 200,
      success: true,
      message: "Success",
    };
  }
```

## 検証計画

### 1. 修正コードのビルドと適用
- 修正完了後、Linkwarden の Docker イメージをローカルで再ビルドしてコンテナを起動します。
  `docker compose down && docker compose build linkwarden && docker compose up -d` を実行します。

### 2. 検索動作および負荷の検証
- `url:https://...` 形式の検索が、修正後も正しく一致するリンクを返すことを確認します。
- テストコマンドを用いて超高速で API リクエストを連続送信し、サーバーの CPU 使用率やレスポンス速度が劇的に改善（ほぼ無負荷で応答）されていることを検証します。

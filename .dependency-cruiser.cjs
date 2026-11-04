/**
 * import の決まりごと。`npm run deps:check` で検査する。
 * 決まりの意図は docs/ARCHITECTURE.md の「依存の決まり」を参照。
 *
 * 今ある違反は .dependency-cruiser-known-violations.json に控えてあり、検査では数えない。
 * 直したら `npm run deps:baseline` で控えを作り直す（増やすためには使わない）。
 */
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      comment: '循環した import は、どちらを先に読み込むかで動きが変わり、追うのも難しい。共通の部分を別ファイルに出す。',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'lib-not-to-bot',
      comment:
        'vrchat/・x/・canva/・image-gen/・video/ は Bot から使う部品。Bot（discordbot/）の設定や処理を読まず、'
        + '必要な値は呼び出し側から引数で受け取る。',
      severity: 'error',
      from: { path: '^src/(vrchat|x|canva|image-gen|video)/' },
      to: { path: '^src/discordbot/' },
    },
    {
      name: 'commands-utils-only-from-commands',
      comment: 'commands/utils はスラッシュコマンド用の部品。コマンド以外からも使うものは共通の場所に置く。',
      severity: 'error',
      from: { path: '^src/discordbot/', pathNot: '^src/discordbot/commands/' },
      to: { path: '^src/discordbot/commands/utils' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)__tests__/' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      extensions: ['.ts', '.tsx', '.js', '.json'],
    },
  },
};

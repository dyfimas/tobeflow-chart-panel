import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { Configuration } from 'webpack';
import CopyWebpackPlugin from 'copy-webpack-plugin';
// @ts-ignore
import ReplaceInFileWebpackPlugin from 'replace-in-file-webpack-plugin';
import ForkTsCheckerWebpackPlugin from 'fork-ts-checker-webpack-plugin';
// @ts-ignore
import LiveReloadPlugin from 'webpack-livereload-plugin';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pkg = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'));

const config = (env: Record<string, unknown>, argv: { mode?: string }): Configuration => {
  const isProduction =
    !!env.production ||
    argv.mode === 'production';

  return {
    mode: isProduction ? 'production' : 'development',
    devtool: isProduction ? 'source-map' : 'eval-source-map',
    context: path.resolve(__dirname),
    entry: {
      module: './src/module.ts',
    },
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: '[name].js',
      library: {
        type: 'amd',
      },
      clean: true,
    },
    externals: [
      // Function-based external to catch react/* sub-paths (jsx-runtime, jsx-dev-runtime)
      function ({ request }, callback) {
        if (request === 'react' || request?.startsWith('react/') || request === 'react-dom') {
          return callback(null, 'react');
        }
        const staticExternals = [
          '@grafana/data',
          '@grafana/ui',
          '@grafana/runtime',
          '@grafana/schema',
          'lodash',
          'emotion',
          '@emotion/css',
          '@emotion/react',
        ];
        if (request && staticExternals.includes(request)) {
          return callback(null, request);
        }
        callback();
      },
    ],
    resolve: {
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
    },
    optimization: {
      minimize: isProduction,
      // Merge modules into fewer chunks for smaller output
      concatenateModules: true,
      // Remove unused exports (tree-shaking)
      usedExports: true,
      sideEffects: true,
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          exclude: [/node_modules/, /__tests__/, /__mocks__/, /\.test\.tsx?$/],
          use: {
            loader: 'swc-loader',
            options: {
              jsc: {
                parser: {
                  syntax: 'typescript',
                  tsx: true,
                },
                transform: {
                  react: {
                    runtime: 'automatic',
                    development: !isProduction,
                  },
                },
                target: 'es2021',
              },
            },
          },
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader'],
        },
      ],
    },
    plugins: [
      new CopyWebpackPlugin({
        patterns: [
          { from: 'src/plugin.json', to: 'plugin.json' },
          { from: 'src/img', to: 'img', noErrorOnMissing: true },
          { from: 'README.md', to: 'README.md', noErrorOnMissing: true },
          { from: 'LICENSE', to: 'LICENSE', toType: 'file', noErrorOnMissing: true },
          { from: 'CHANGELOG.md', to: 'CHANGELOG.md', noErrorOnMissing: true },
        ],
      }),
      new ForkTsCheckerWebpackPlugin({
        typescript: {
          configFile: path.resolve(__dirname, 'tsconfig.json'),
        },
      }),
      new ReplaceInFileWebpackPlugin([{
        dir: path.resolve(__dirname, 'dist'),
        files: ['plugin.json'],
        rules: [
          { search: '%VERSION%', replace: pkg.version },
          { search: '%TODAY%', replace: new Date().toISOString().slice(0, 10) },
        ],
      }]),
      ...(!isProduction
        ? [
            new LiveReloadPlugin({
              appendScriptTag: false,
            }),
          ]
        : []),
    ],
  };
};

export default config;

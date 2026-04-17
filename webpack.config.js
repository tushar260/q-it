const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const ZipPlugin = require('zip-webpack-plugin');

module.exports = {
  entry: {
    popup: './popup.js',
    'popup-init': './popup-init.js',
    background: './background.js',
    content: './content.js'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    clean: true
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env']
          }
        }
      }
    ]
  },
  optimization: {
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          format: {
            comments: false,
          },
        },
        extractComments: false,
      }),
    ],
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'manifest.json', to: 'manifest.json' },
        { from: 'popup.html', to: 'popup.html' },
        { from: 'popup.css', to: 'popup.css' },
        { from: 'icons', to: 'icons' },
        { from: 'lib', to: 'lib' },
        // If there are other assets, list them here
      ],
    }),
    new ZipPlugin({
      path: '../',
      filename: 'q-it.zip',
    }),
  ],
};
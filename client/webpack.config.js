const { resolve } = require('path')

module.exports = {
    target: 'web',
    entry: './src/main.ts',
    output: {
        filename: 'bundle.js',
        path: resolve( __dirname, 'dist' )
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                exclude: /node_module/,
                use: 'ts-loader'
            },
        ],
    },
    resolve: {
        extensions: [ '.ts', '.js' ]
    },
    mode: 'production'
}

# ShinosawaHiroshi

> Minimal eBook writer.

<img width="1278" height="688" alt="Screenshot" src="https://github.com/user-attachments/assets/bbb263bc-9407-4699-8e06-436486df554c" />

## Status

> [!WARNING]
> This project is **currently under development** and **only works on my machine**.
> The latest progress of this project can be seen on the [master branch](https://github.com/potistudio/Shinosawa/tree/master).

## Development

This project uses mise.
So, please setup it before build.

### Requirements

- Rust 1.99.0
- Node.js 26.13.0

### 1. Clone this repository

```sh
git clone https://github.com/potistudio/Shinosawa.git
cd Shinosawa
```

### 2. Install dependencies

```sh
pnpm install
```

### 3. Check and test

```sh
pnpm check
pnpm test
```

### 4. Run the application

```sh
pnpm run tauri dev
```

### 5. Bundle the application

```sh
pnpm run tauri build             # with installer
pnpm run tauri build --no-bundle # without installer
```

## License

This project is licensed under the [MIT License](LICENSE).

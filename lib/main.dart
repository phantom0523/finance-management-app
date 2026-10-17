import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'dart:convert';
import 'dart:io';
import 'package:file_selector/file_selector.dart';

void main() {
  runApp(const EWalletApp());
}

class EWalletApp extends StatelessWidget {
  const EWalletApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'E-Wallet',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.black),
        useMaterial3: true,
      ),
      home: const WalletScreen(),
      debugShowCheckedModeBanner: false,
    );
  }
}

class WalletScreen extends StatefulWidget {
  const WalletScreen({super.key});

  @override
  State<WalletScreen> createState() => _WalletScreenState();
}

class _WalletScreenState extends State<WalletScreen> {
  late final WebViewController _controller;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..loadFlutterAsset('assets/index.html');
      _controller.addJavaScriptChannel(
        'ExportBridge',
        onMessageReceived: (JavaScriptMessage message) async {
          // 1. Decode the JSON sent from app.js
          final payload = jsonDecode(message.message);
          final String fileName = payload['filename'];
          final String csvData = payload['data'];

          // 2. Open the native macOS Save As window
          final FileSaveLocation? result = await getSaveLocation(suggestedName: fileName);
          
          // 3. Save the file to the chosen location
          if (result != null) {
            final File file = File(result.path);
            await file.writeAsString('\uFEFF$csvData'); // \uFEFF ensures Excel reads symbols/currency correctly
          }
        },
      );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: WebViewWidget(controller: _controller),
    );
  }
}
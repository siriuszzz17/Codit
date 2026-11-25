package com.codit.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.PermissionRequest;
import android.widget.FrameLayout;
import androidx.core.content.ContextCompat;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebChromeClient;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * WebChromeClient customizado para liberar recursos WebRTC/mídia na WebView
 * sem perder o gesto do usuário quando as permissões do Android já estão ativas,
 * além de suportar tela cheia em vídeos de compartilhamento de tela.
 */
public class CoditWebChromeClient extends BridgeWebChromeClient {

    public interface RuntimePermissionRequester {
        void requestPermissions(String[] permissions, RuntimePermissionCallback callback);
    }

    public interface RuntimePermissionCallback {
        void onResult(Map<String, Boolean> grantMap);
    }

    private final MainActivity activity;
    private final RuntimePermissionRequester permissionRequester;
    private View customFullscreenView;
    private CustomViewCallback customFullscreenCallback;

    public CoditWebChromeClient(
        MainActivity activity,
        Bridge bridge,
        RuntimePermissionRequester permissionRequester
    ) {
        super(bridge);
        this.activity = activity;
        this.permissionRequester = permissionRequester;
    }

    private boolean isTrustedWebViewOrigin(Uri origin) {
        if (origin == null) {
            return false;
        }
        String scheme = origin.getScheme();
        String host = origin.getHost();
        if (scheme == null || host == null) {
            return false;
        }
        if ("capacitor".equalsIgnoreCase(scheme) && "localhost".equalsIgnoreCase(host)) {
            return true;
        }
        if ("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme)) {
            return "localhost".equalsIgnoreCase(host) || "127.0.0.1".equals(host);
        }
        return false;
    }

    @Override
    public void onPermissionRequest(final PermissionRequest request) {
        if (request == null) {
            return;
        }

        activity.runOnUiThread(() -> {
            if (activity.isFinishing() || activity.isDestroyed()) {
                try {
                    request.deny();
                } catch (Throwable ignored) {}
                return;
            }

            if (!isTrustedWebViewOrigin(request.getOrigin())) {
                try {
                    request.deny();
                } catch (Throwable ignored) {}
                return;
            }

            final String[] requestedResources = request.getResources();
            if (requestedResources == null || requestedResources.length == 0) {
                try {
                    request.deny();
                } catch (Throwable ignored) {}
                return;
            }

            Set<String> missingAndroidPermissions = new LinkedHashSet<>();
            for (String resource : requestedResources) {
                if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) {
                    if (
                        ContextCompat.checkSelfPermission(activity, Manifest.permission.RECORD_AUDIO) !=
                        PackageManager.PERMISSION_GRANTED
                    ) {
                        missingAndroidPermissions.add(Manifest.permission.RECORD_AUDIO);
                    }
                } else if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) {
                    if (
                        ContextCompat.checkSelfPermission(activity, Manifest.permission.CAMERA) !=
                        PackageManager.PERMISSION_GRANTED
                    ) {
                        missingAndroidPermissions.add(Manifest.permission.CAMERA);
                    }
                }
            }

            if (missingAndroidPermissions.isEmpty()) {
                try {
                    request.grant(requestedResources);
                } catch (Throwable ignored) {}
                return;
            }

            permissionRequester.requestPermissions(
                missingAndroidPermissions.toArray(new String[0]),
                grantMap -> {
                    List<String> approvedResources = new ArrayList<>();
                    for (String resource : requestedResources) {
                        if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) {
                            boolean audioGranted =
                                Boolean.TRUE.equals(grantMap.get(Manifest.permission.RECORD_AUDIO)) ||
                                ContextCompat.checkSelfPermission(activity, Manifest.permission.RECORD_AUDIO) ==
                                PackageManager.PERMISSION_GRANTED;
                            if (audioGranted) {
                                approvedResources.add(resource);
                            }
                        } else if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) {
                            boolean cameraGranted =
                                Boolean.TRUE.equals(grantMap.get(Manifest.permission.CAMERA)) ||
                                ContextCompat.checkSelfPermission(activity, Manifest.permission.CAMERA) ==
                                PackageManager.PERMISSION_GRANTED;
                            if (cameraGranted) {
                                approvedResources.add(resource);
                            }
                        } else {
                            approvedResources.add(resource);
                        }
                    }

                    try {
                        if (approvedResources.isEmpty()) {
                            request.deny();
                        } else {
                            request.grant(approvedResources.toArray(new String[0]));
                        }
                    } catch (Throwable ignored) {}
                }
            );
        });
    }

    @Override
    public void onShowCustomView(View view, CustomViewCallback callback) {
        if (customFullscreenView != null) {
            if (callback != null) {
                callback.onCustomViewHidden();
            }
            return;
        }
        View decor = activity.getWindow() != null ? activity.getWindow().getDecorView() : null;
        if (!(decor instanceof ViewGroup)) {
            if (callback != null) {
                callback.onCustomViewHidden();
            }
            return;
        }
        customFullscreenView = view;
        customFullscreenCallback = callback;
        ((ViewGroup) decor).addView(
            customFullscreenView,
            new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        );
    }

    @Override
    public void onHideCustomView() {
        if (customFullscreenView == null) {
            return;
        }
        View decor = activity.getWindow() != null ? activity.getWindow().getDecorView() : null;
        if (decor instanceof ViewGroup) {
            ((ViewGroup) decor).removeView(customFullscreenView);
        }
        customFullscreenView = null;
        if (customFullscreenCallback != null) {
            customFullscreenCallback.onCustomViewHidden();
            customFullscreenCallback = null;
        }
    }
}

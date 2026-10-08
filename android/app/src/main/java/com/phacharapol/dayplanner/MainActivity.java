package com.phacharapol.dayplanner;

import android.content.Intent;
import android.os.Bundle;
import android.view.KeyEvent;

import com.getcapacitor.BridgeActivity;

import org.json.JSONException;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PlannerPlugin.class);
        super.onCreate(savedInstanceState);
        captureShare(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        captureShare(intent);
    }

    /**
     * Route the hardware/3-button Back key straight to the back dispatcher (and so to the web app's
     * handler). Left alone, a focused WebView input receives KEYCODE_BACK first and, with predictive
     * back on recent Android, the key can be swallowed — Back would silently do nothing while typing.
     * Back gestures already go through the dispatcher; the IME still gets Back first to close itself.
     */
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (event.getKeyCode() == KeyEvent.KEYCODE_BACK) {
            if (event.getAction() == KeyEvent.ACTION_UP && !event.isCanceled()) {
                getOnBackPressedDispatcher().onBackPressed();
            }
            return true;
        }
        return super.dispatchKeyEvent(event);
    }

    /** "Share → Day Planner" from any app lands the text in the inbox. */
    private void captureShare(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        String subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
        if (text == null || text.trim().isEmpty()) return;
        JSONObject action = new JSONObject();
        try {
            action.put("type", "share");
            action.put("text", text.trim());
            if (subject != null) action.put("subject", subject.trim());
        } catch (JSONException e) {
            return;
        }
        PlannerStore.addPending(this, action);
        // Consume it so a config change doesn't add it twice.
        intent.setAction(Intent.ACTION_MAIN);
        PlannerPlugin.emitPending();
    }
}

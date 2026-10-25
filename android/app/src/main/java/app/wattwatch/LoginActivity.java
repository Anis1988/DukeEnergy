package app.wattwatch;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * Duke Energy's login page (with its "not a robot" check) in a plain web view. As soon as the page goes to the
 * address that carries the login code (a real redirect, or Auth0 changing the address in place), the address is
 * handed back and this screen closes. Nothing typed here is read by the app.
 */
public class LoginActivity extends Activity {
    private String prefix;
    private boolean done = false;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        String url = getIntent().getStringExtra("url");
        prefix = getIntent().getStringExtra("prefix");

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.WHITE);
        root.setFitsSystemWindows(true);

        LinearLayout bar = new LinearLayout(this);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(32, 16, 16, 16);
        TextView title = new TextView(this);
        title.setText("Duke Energy login");
        title.setTextSize(17);
        title.setTextColor(Color.rgb(22, 32, 38));
        bar.addView(title, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        Button close = new Button(this);
        close.setText("Cancel");
        close.setOnClickListener(v -> { setResult(RESULT_CANCELED); finish(); });
        bar.addView(close);
        root.addView(bar);

        WebView web = new WebView(this);
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        // Some login pages refuse "in-app" browsers: present as plain Chrome.
        web.getSettings().setUserAgentString(web.getSettings().getUserAgentString().replace("; wv", ""));
        CookieManager.getInstance().setAcceptCookie(true);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return check(request.getUrl().toString());
            }
            @Override
            public void onPageStarted(WebView view, String u, Bitmap favicon) {
                if (check(u)) view.stopLoading();
            }
            @Override
            public void doUpdateVisitedHistory(WebView view, String u, boolean isReload) {
                check(u);
            }
        });
        root.addView(web, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        setContentView(root);
        web.loadUrl(url);
    }

    /** True (and closes) when the address is the one with the code. */
    private boolean check(String u) {
        if (done || u == null || prefix == null || !u.startsWith(prefix)) return false;
        done = true;
        setResult(RESULT_OK, new Intent().putExtra("url", u));
        finish();
        return true;
    }
}

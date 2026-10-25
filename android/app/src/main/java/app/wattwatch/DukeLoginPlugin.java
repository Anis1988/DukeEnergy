package app.wattwatch;

import android.app.Activity;
import android.content.Intent;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 🔑 Connect: opens Duke's login page in the app (LoginActivity) and gives the screens back the address Duke lands
 * on after the login (it holds the one-time code). On the website the user copies that address by hand.
 */
@CapacitorPlugin(name = "DukeLogin")
public class DukeLoginPlugin extends Plugin {
    @PluginMethod
    public void open(PluginCall call) {
        String url = call.getString("url", "");
        String prefix = call.getString("catchPrefix", "");
        if (!url.startsWith("https://") || !prefix.startsWith("https://")) { call.reject("Bad login address."); return; }
        Intent i = new Intent(getContext(), LoginActivity.class).putExtra("url", url).putExtra("prefix", prefix);
        startActivityForResult(call, i, "done");
    }

    @ActivityCallback
    private void done(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getStringExtra("url") == null) {
            call.reject("Login cancelled.");
            return;
        }
        JSObject r = new JSObject();
        r.put("url", data.getStringExtra("url"));
        call.resolve(r);
    }
}

package app.wattwatch;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DukeLoginPlugin.class); // 🔑 Duke's login page inside the app
        registerPlugin(UpdatePlugin.class); // ⬆️ the update banner's Update button
        super.onCreate(savedInstanceState);
    }
}

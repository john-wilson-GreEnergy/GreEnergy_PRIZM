import java.util.UUID;
import java.io.FileOutputStream;

// In a real environment, we would compile this with Turtle JARs in the classpath.
import com.powin.tongue.fourba.command.Command;
import com.powin.tongue.fourba.command.Endpoint;
import com.powin.tongue.fourba.command.EndpointType;
import com.powin.tongue.fourba.command.CommandPayload;
import com.powin.tongue.fourba.command.SetEMSApplicationEnabledStatus;

public class BuildEmsAppEnableCommand {
    public static void main(String[] args) throws Exception {
        if (args.length < 7) {
            System.err.println("Usage: BuildEmsAppEnableCommand <stationCode> <blockIndex> <appCode> <priority> <enabled> <username> <outPath>");
            System.exit(1);
        }

        String stationCode = args[0];
        int blockIndex = Integer.parseInt(args[1]);
        String appCode = args[2];
        int priority = Integer.parseInt(args[3]);
        boolean enabled = Boolean.parseBoolean(args[4]);
        String username = args[5];
        String outPath = args[6];

        Endpoint target = Endpoint.newBuilder()
            .setEndpointType(EndpointType.BLOCK)
            .setStationCode(stationCode)
            .setBlockIndex(blockIndex)
            .build();

        SetEMSApplicationEnabledStatus status = SetEMSApplicationEnabledStatus.newBuilder()
            .setApplicationTypeCode(appCode)
            .setApplicationPriority(priority)
            .setEnabled(enabled)
            .build();

        CommandPayload payload = CommandPayload.newBuilder()
            .setSetEMSApplicationEnabledStatus(status)
            .build();

        Command cmd = Command.newBuilder()
            .setCommandId(UUID.randomUUID().toString())
            .setCommandTarget(target)
            .setCommandSource(target)
            .setCommandPayload(payload)
            .setUsername(username)
            .build();

        try (FileOutputStream fos = new FileOutputStream(outPath)) {
            cmd.writeTo(fos);
        }
        
        System.out.println(cmd.getCommandId());
    }
}
